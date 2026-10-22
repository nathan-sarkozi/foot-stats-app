import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
// Next normally initializes this global in its server runtime. The standalone
// Node runner must do the same before loading Next's request/matcher utilities.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage
const { NextRequest, NextResponse } = require('next/server')
const { createServerClient, createChunks } = require('@supabase/ssr')
// Next 16.2.5 still exports the matcher utility under its previous name.
const { unstable_doesMiddlewareMatch: doesProxyMatch } = require(
  'next/dist/experimental/testing/server/middleware-testing-utils',
)

// Offline tests of the actual proxy and actual Supabase SSR/Auth client.
// Only the transport is replaced. No dotenv, real accounts or network calls.
// Run: node --test --test-isolation=none tests/supabase-session.test.mjs
const origin = 'https://synthetic-session.supabase.invalid'
const env = { NEXT_PUBLIC_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key' }
const cookieName = 'sb-synthetic-session-auth-token'
const user = {
  id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
}
const cacheControl = 'private, no-cache, no-store, must-revalidate, max-age=0'

function loadModule(path, mocks) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
    fileName: path,
  }).outputText
  const sourceModule = { exports: {} }
  const context = vm.createContext({
    module: sourceModule, exports: sourceModule.exports, process: { env },
    require(name) {
      if (name in mocks) return mocks[name]
      if (name === 'react/jsx-runtime') return require(name)
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  new vm.Script(compiled, { filename: path }).runInContext(context)
  return sourceModule.exports
}

function jwt(expiresAt) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt,
    iat: expiresAt - 3600, iss: `${origin}/auth/v1`,
  })}`
  return `${body}.${createHmac('sha256', 'synthetic-test-signing-key').update(body).digest('base64url')}`
}

function session({ expired = false, padding = '', refreshToken = 'synthetic-old-refresh' } = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600)
  return {
    access_token: jwt(expiresAt), refresh_token: refreshToken, token_type: 'bearer',
    expires_in: 3600, expires_at: expiresAt,
    user: { ...user, user_metadata: padding ? { padding } : {} },
  }
}

function sessionCookies(value) {
  return createChunks(cookieName, `base64-${Buffer.from(JSON.stringify(value)).toString('base64url')}`)
}

function requestFor(path, cookies = [], init = {}) {
  return new NextRequest(`https://footstats.invalid${path}`, {
    ...init,
    headers: { ...init.headers, cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; ') },
  })
}

function decodeSession(cookies) {
  const base = cookies.find(cookie => cookie.name === cookieName && cookie.value)
  const value = base?.value ?? cookies
    .filter(cookie => cookie.name.startsWith(`${cookieName}.`) && cookie.value)
    .sort((a, b) => Number(a.name.split('.').at(-1)) - Number(b.name.split('.').at(-1)))
    .map(cookie => cookie.value).join('')
  return JSON.parse(Buffer.from(value.slice('base64-'.length), 'base64url').toString('utf8'))
}

function loadProxy({ refreshedSession = session({ refreshToken: 'synthetic-new-refresh' }), rejectRefresh = false } = {}) {
  const requests = []
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    assert.equal(url.origin, origin, 'Only the fictitious Auth origin may be requested')
    requests.push({ pathname: url.pathname, method: init.method, body: init.body, headers: init.headers })
    if (url.pathname === '/auth/v1/token') {
      assert.equal(url.searchParams.get('grant_type'), 'refresh_token')
      return Response.json(rejectRefresh
        ? { code: 'refresh_token_not_found', msg: 'Synthetic invalid refresh token' }
        : refreshedSession, { status: rejectRefresh ? 400 : 200 })
    }
    if (url.pathname === '/auth/v1/user') return Response.json(user)
    throw new Error(`Unexpected mocked Auth path: ${url.pathname}`)
  }
  const helper = loadModule('src/utils/supabase/proxy.ts', {
    '@supabase/ssr': {
      createServerClient(url, key, options) {
        assert.equal(url, origin)
        assert.equal(key, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
        return createServerClient(url, key, { ...options, global: { fetch } })
      },
    },
    'next/server': { NextResponse },
  })
  const proxyModule = loadModule('src/proxy.ts', { '@/utils/supabase/proxy': helper })
  return { ...proxyModule, requests, refreshedSession }
}

function assertPassThrough(response) {
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-middleware-next'), '1')
  assert.equal(response.headers.get('location'), null)
}

function assertPrivate(response) {
  assert.equal(response.headers.get('cache-control'), cacheControl)
  assert.equal(response.headers.get('pragma'), 'no-cache')
  assert.equal(response.headers.get('expires'), '0')
}

test('expired session is refreshed for the render and persisted for the next browser request', async () => {
  const { proxy, requests, refreshedSession } = loadProxy()
  const request = requestFor('/dashboard', [
    ...sessionCookies(session({ expired: true })), { name: 'unrelated', value: 'preserved' },
  ])
  const response = await proxy(request)
  assertPassThrough(response)
  assertPrivate(response)
  assert.equal(requests.filter(entry => entry.pathname === '/auth/v1/token').length, 1)
  assert.equal(JSON.parse(requests.find(entry => entry.pathname === '/auth/v1/token').body).refresh_token,
    'synthetic-old-refresh')
  assert.equal(decodeSession(request.cookies.getAll()).refresh_token, refreshedSession.refresh_token)
  assert.equal(decodeSession(response.cookies.getAll()).access_token, refreshedSession.access_token)
  assert.equal(request.cookies.get('unrelated').value, 'preserved')
  const forwardedRequest = new NextRequest('https://footstats.invalid/dashboard', {
    headers: { cookie: response.headers.get('x-middleware-request-cookie') },
  })
  assert.equal(decodeSession(forwardedRequest.cookies.getAll()).refresh_token, refreshedSession.refresh_token)
  const authCookie = response.cookies.get(cookieName)
  assert.equal(authCookie.path, '/')
  assert.equal(authCookie.sameSite, 'lax')
  assert.ok(authCookie.maxAge > 0)
  const browserCookies = new Map(request.cookies.getAll().map(cookie => [cookie.name, cookie]))
  for (const cookie of response.cookies.getAll()) {
    if (cookie.maxAge === 0) browserCookies.delete(cookie.name)
    else browserCookies.set(cookie.name, cookie)
  }
  const followUp = await proxy(requestFor('/dashboard', [...browserCookies.values()]))
  assertPassThrough(followUp)
  assert.equal(requests.filter(entry => entry.pathname === '/auth/v1/token').length, 1)
  assert.equal(followUp.cookies.getAll().length, 0)
})

test('refresh removes obsolete session chunks and preserves their deletion options', async () => {
  const { proxy } = loadProxy()
  const oldCookies = sessionCookies(session({ expired: true, padding: 'x'.repeat(7000) }))
  assert.ok(oldCookies.length > 1)
  const request = requestFor('/dashboard', oldCookies)
  const response = await proxy(request)
  assertPrivate(response)
  assert.equal(decodeSession(response.cookies.getAll()).refresh_token, 'synthetic-new-refresh')
  for (const oldCookie of oldCookies) {
    const deleted = response.cookies.get(oldCookie.name)
    assert.equal(deleted.value, '')
    assert.equal(deleted.maxAge, 0)
    assert.equal(deleted.path, '/')
    assert.equal(deleted.sameSite, 'lax')
    assert.equal(request.cookies.get(oldCookie.name).value, '')
  }
})

test('refresh forwards all new chunks to both the browser and the render', async () => {
  const refreshedSession = session({ refreshToken: 'synthetic-new-refresh', padding: 'x'.repeat(7000) })
  const { proxy } = loadProxy({ refreshedSession })
  const request = requestFor('/profile/synthetic-player', sessionCookies(session({ expired: true })))
  const response = await proxy(request)
  assertPassThrough(response)
  const newChunks = response.cookies.getAll().filter(cookie => cookie.value)
  assert.ok(newChunks.length > 1)
  assert.equal(decodeSession(newChunks).refresh_token, refreshedSession.refresh_token)
  assert.equal(decodeSession(request.cookies.getAll()).refresh_token, refreshedSession.refresh_token)
  for (const cookie of newChunks) {
    assert.equal(request.cookies.get(cookie.name).value, cookie.value)
    assert.equal(cookie.sameSite, 'lax')
    assert.ok(cookie.maxAge > 0)
  }
})

test('a valid session is verified without refreshing or rewriting browser cookies', async () => {
  const { proxy, requests } = loadProxy()
  const cookies = sessionCookies(session())
  const request = requestFor('/dashboard', cookies)
  const response = await proxy(request)
  assertPassThrough(response)
  assert.deepEqual(requests.map(entry => entry.pathname), ['/auth/v1/user'])
  assert.equal(response.cookies.getAll().length, 0)
  assert.deepEqual(request.cookies.getAll(), cookies)
})

test('anonymous dashboard, public profile, login and registration requests are never redirected by the proxy', async () => {
  const { proxy, requests } = loadProxy()
  for (const path of ['/dashboard', '/profile/synthetic-player', '/login', '/register']) {
    const response = await proxy(requestFor(path, [{ name: 'unrelated', value: 'preserved' }]))
    assertPassThrough(response)
    assert.equal(response.cookies.getAll().length, 0)
  }
  assert.equal(requests.length, 0)
})

test('an invalid refresh token clears the obsolete session without a proxy redirect', async t => {
  // Auth-js reports the intentionally rejected fake token. Keep this expected
  // failure out of the test logs without suppressing other errors.
  const originalError = console.error
  t.mock.method(console, 'error', (...args) => {
    if (args[0]?.message === 'Synthetic invalid refresh token') return
    originalError(...args)
  })
  const { proxy, requests } = loadProxy({ rejectRefresh: true })
  const request = requestFor('/login', sessionCookies(session({ expired: true })))
  const response = await proxy(request)
  assertPassThrough(response)
  assertPrivate(response)
  assert.equal(requests.filter(entry => entry.pathname === '/auth/v1/token').length, 1)
  assert.equal(response.cookies.get(cookieName).maxAge, 0)
  assert.equal(response.cookies.get(cookieName).value, '')
  await new Promise(resolve => setImmediate(resolve))
})

test('an invalid stored session is cleared without requesting Auth', async () => {
  const { proxy, requests } = loadProxy()
  const response = await proxy(requestFor('/profile/synthetic-player', sessionCookies({ invalid: true })))
  assertPassThrough(response)
  assertPrivate(response)
  assert.equal(requests.length, 0)
  assert.equal(response.cookies.get(cookieName).maxAge, 0)
  assert.equal(response.cookies.get(cookieName).value, '')
})

test('cookie adapter preserves explicit options, every cookie and SSR cache headers', async () => {
  const expires = new Date('2027-01-01T00:00:00Z')
  const cookiesToSet = [
    { name: 'synthetic.0', value: 'chunk-one', options: {
      path: '/', secure: true, httpOnly: true, sameSite: 'strict', maxAge: 120, expires,
    } },
    { name: 'synthetic.1', value: 'chunk-two', options: { path: '/', sameSite: 'lax' } },
    { name: 'obsolete', value: '', options: { path: '/', maxAge: 0 } },
  ]
  const helper = loadModule('src/utils/supabase/proxy.ts', {
    '@supabase/ssr': {
      createServerClient(url, key, { cookies }) {
        return { auth: { async getClaims() {
          assert.equal(cookies.getAll().find(cookie => cookie.name === 'unrelated').value, 'preserved')
          cookies.setAll(cookiesToSet, { 'Cache-Control': cacheControl, Pragma: 'no-cache', Expires: '0' })
          return { data: null, error: null }
        } } }
      },
    },
    'next/server': { NextResponse },
  })
  const request = requestFor('/dashboard', [{ name: 'unrelated', value: 'preserved' }])
  const response = await helper.updateSession(request)
  assertPrivate(response)
  for (const cookie of cookiesToSet) {
    assert.equal(request.cookies.get(cookie.name).value, cookie.value)
    assert.equal(response.cookies.get(cookie.name).value, cookie.value)
  }
  const cookie = response.cookies.get('synthetic.0')
  assert.equal(cookie.path, '/')
  assert.equal(cookie.secure, true)
  assert.equal(cookie.httpOnly, true)
  assert.equal(cookie.sameSite, 'strict')
  assert.equal(cookie.maxAge, 120)
  assert.ok(cookie.expires instanceof Date)
  assert.equal(response.cookies.get('obsolete').maxAge, 0)
  assert.equal(request.cookies.get('unrelated').value, 'preserved')
})

test('matcher covers session UI and Server Actions, and excludes APIs, crons and assets', () => {
  const { config } = loadProxy()
  for (const path of [
    '/dashboard', '/dashboard/add-match', '/dashboard/edit-match/synthetic-id',
    '/profile/synthetic-player', '/profile/synthetic-player/career', '/login', '/register',
  ]) assert.equal(doesProxyMatch({ config, url: `https://footstats.invalid${path}` }), true, path)
  for (const path of [
    '/', '/api/cron/rbfa', '/api/synthetic', '/_next/static/app.js', '/_next/image',
    '/favicon.ico', '/logo.png', '/dashboard-unrelated', '/profiles',
  ]) assert.equal(doesProxyMatch({ config, url: `https://footstats.invalid${path}` }), false, path)
  assert.equal(doesProxyMatch({
    config, url: 'https://footstats.invalid/dashboard/add-match', headers: { 'next-action': 'synthetic-action' },
  }), true)
})

test('refresh retains POST action headers and forwards the new session before action execution', async () => {
  const { proxy } = loadProxy()
  const request = requestFor('/dashboard/add-match', sessionCookies(session({ expired: true })), {
    method: 'POST', body: 'synthetic-body', headers: { 'next-action': 'synthetic-action' },
  })
  const response = await proxy(request)
  assertPassThrough(response)
  assert.equal(request.method, 'POST')
  assert.equal(await request.text(), 'synthetic-body')
  assert.equal(response.headers.get('x-middleware-request-next-action'), 'synthetic-action')
  assert.ok(response.headers.get('x-middleware-request-cookie').includes(cookieName))
})

test('existing mutation guards still reject unauthenticated writes before validation or database access', async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc() { assert.fail('Unauthenticated RPC must not run') },
    from() { assert.fail('Unauthenticated database mutation must not run') },
  }
  const mocks = {
    '@/utils/supabase/server': { createClient: async () => client },
    'next/cache': { revalidatePath() { assert.fail('Unauthenticated revalidation must not run') } },
    'next/navigation': { redirect() { assert.fail('Unauthorized mutation must fail first') } },
    '../match-form': {}, '../../match-form': {},
  }
  const add = loadModule('src/app/dashboard/add-match/actions.ts', mocks)
  const edit = loadModule('src/app/dashboard/edit-match/[id]/actions.ts', mocks)
  for (const action of [add.addMatch, edit.updateMatch, edit.deleteMatch]) {
    const result = await action({ status: 'idle', message: '' }, new FormData())
    assert.equal(result.status, 'error')
    assert.match(result.message, /session a expiré/)
  }
})

test('dashboard layout still redirects anonymous users to login before accessing profile data', async () => {
  const layout = loadModule('src/app/dashboard/layout.tsx', {
    '@/utils/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from() { assert.fail('Anonymous dashboard must not fetch profiles') },
    }) },
    'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`) } },
    './components/NavigationProvider': { __esModule: true, default: ({ children }) => children },
    '@/utils/playerStats': { getCurrentSeason: () => ({ startYear: 2026 }) },
    './components/navigation.module.css': { __esModule: true, default: {} },
    './components/Navbar': { __esModule: true, default: () => null },
  })
  await assert.rejects(layout.default({ children: null }), { message: 'REDIRECT:/login' })
})
