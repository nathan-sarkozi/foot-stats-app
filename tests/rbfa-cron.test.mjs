import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as rbfaDate from '../src/utils/rbfaDate.ts'

const require = createRequire(import.meta.url)
const { NextResponse } = require('next/server')
const FIXED_NOW = Date.parse('2026-10-19T12:00:00Z')
const SCRAPER_KEY = 'synthetic-scraper-key-never-log'
const SERVICE_KEY = 'synthetic-service-key-never-log'
const PRIVATE_ERROR = 'synthetic-private-provider-detail'
const environment = {
  CRON_SECRET: 'synthetic-cron-secret', CRON_SECRET_2: 'synthetic-secondary-secret',
  SCRAPER_API_KEY: SCRAPER_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.invalid',
}

class FixedDate extends Date {
  constructor(value = FIXED_NOW) { super(value) }
  static now() { return FIXED_NOW }
}

function load(relativePath, dependencies, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'), {
    fileName: relativePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loadedModule = { exports: {} }
  new vm.Script(compiled, { filename: relativePath }).runInContext(vm.createContext({
    module: loadedModule, exports: loadedModule.exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      throw new Error(`Unexpected cron test dependency: ${name}`)
    },
    ...globals,
  }))
  return loadedModule.exports
}

const contracts = load('src/utils/rbfa-contracts.ts', { zod: require('zod'), './rbfaDate': rbfaDate })
const upcomingMatch = teamId => ({
  startTime: '2026-10-24T13:00:00Z',
  homeTeam: { name: `Synthetic team ${teamId}`, logo: null },
  awayTeam: { name: 'Synthetic opponent', logo: null },
  series: { name: 'Synthetic series' },
})
const ranking = teamId => ({ teams: [{
  teamId, name: `Synthetic team ${teamId}`, logo: null,
  position: 1, points: 3, matchesPlayed: 1, goalDifference: 1,
}] })
const successfulResponse = (teamId, operationName) => operationName === 'GetUpcomingMatch'
  ? { data: { upcomingMatch: upcomingMatch(teamId) } }
  : { data: { teamSeriesAndRankings: { rankings: [{ rankings: [ranking(teamId)] }] } } }

// The real route, sync orchestration and validators run together. Every SDK
// query and HTTP request ends in an explicit in-memory adapter, never a socket.
function cron(options = {}) {
  const calls = { clients: [], queries: [], requests: [], databaseRequests: [], writes: [], logs: [] }
  const env = { ...environment, ...options.env }
  const fetcher = async (input, init) => {
    const url = new URL(input)
    assert.equal(url.origin, 'https://api.scraperapi.com')
    assert.equal(url.pathname, '/')
    assert.equal(url.searchParams.get('api_key'), SCRAPER_KEY)
    assert.equal(url.searchParams.get('url'), 'https://datalake-prod2018.rbfa.be/graphql')
    assert.equal(init.method, 'POST')
    assert.equal(init.cache, 'no-store')
    assert.ok(init.signal instanceof AbortSignal)
    const body = JSON.parse(init.body)
    assert.equal(body.variables.language, 'fr')
    assert.equal(body.extensions.persistedQuery.version, 1)
    assert.match(body.extensions.persistedQuery.sha256Hash, /^[a-f0-9]{64}$/)
    const request = { teamId: body.variables.teamId, operationName: body.operationName }
    calls.requests.push(request)
    if (options.fetchResponse) return options.fetchResponse(request)
    return Response.json(successfulResponse(request.teamId, request.operationName))
  }
  const client = {
    from(table) {
      assert.ok(['profiles', 'rbfa_cache'].includes(table))
      const query = { table }
      calls.queries.push(query)
      const builder = {
        select(columns) { query.select = columns; return builder },
        in(column, values) { query.filter = { column, values }; return builder },
        returns() { return builder },
        single() { query.single = true; return builder },
        upsert(row, settings) {
          query.upsert = row
          query.upsertOptions = settings
          calls.writes.push(structuredClone(row))
          return builder
        },
        abortSignal(signal) {
          assert.ok(signal instanceof AbortSignal)
          query.hasAbortSignal = true
          return builder
        },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            assert.equal(query.hasAbortSignal, true)
            if (options.databaseResponse) {
              const result = options.databaseResponse(query)
              if (result !== undefined) return result
            }
            if (table === 'profiles') {
              assert.equal(query.select, 'rbfa_team_id')
              return {
                data: (options.profiles ?? ['101']).map(rbfa_team_id => ({ rbfa_team_id })), error: null,
              }
            }
            if (query.upsert) {
              assert.equal(query.select, 'team_id')
              assert.equal(query.single, true)
              assert.equal(query.upsertOptions.onConflict, 'team_id')
              return { data: { team_id: query.upsert.team_id }, error: null }
            }
            assert.equal(query.select, 'team_id, upcoming_match, rankings, updated_at')
            assert.equal(query.filter.column, 'team_id')
            return { data: options.cached ?? [], error: null }
          }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  const sync = load('src/services/rbfa-sync.ts', {
    '@/utils/rbfa-contracts': contracts, '@/utils/rbfaDate': rbfaDate,
  }, {
    fetch: fetcher, Date: FixedDate,
    AbortController, AbortSignal, setTimeout, clearTimeout, URL, URLSearchParams,
  })
  const route = load('src/app/api/cron/rbfa/route.ts', {
    'next/server': { NextResponse },
    '@supabase/supabase-js': {
      createClient(url, key, settings) {
        calls.clients.push({ url, key, settings })
        assert.equal(url, environment.NEXT_PUBLIC_SUPABASE_URL)
        assert.equal(key, SERVICE_KEY)
        assert.equal(settings.auth.persistSession, false)
        assert.equal(settings.auth.autoRefreshToken, false)
        if (options.clientError) throw options.clientError
        if (options.realSdk) {
          return require('@supabase/supabase-js').createClient(url, key, {
            ...settings,
            global: { fetch: async (input, init) => {
              const url = new URL(input)
              assert.equal(url.origin, environment.NEXT_PUBLIC_SUPABASE_URL)
              assert.ok(init.signal instanceof AbortSignal)
              const headers = new Headers(init.headers)
              assert.equal(headers.get('apikey'), SERVICE_KEY)
              assert.equal(headers.get('authorization'), `Bearer ${SERVICE_KEY}`)
              calls.databaseRequests.push({
                path: url.pathname, method: init.method, select: url.searchParams.get('select'),
              })
              if (url.pathname === '/rest/v1/profiles') {
                assert.equal(init.method, 'GET')
                assert.equal(url.searchParams.get('select'), 'rbfa_team_id')
                return Response.json([{ rbfa_team_id: '101' }])
              }
              assert.equal(url.pathname, '/rest/v1/rbfa_cache')
              if (init.method === 'GET') {
                assert.equal(url.searchParams.get('select'), 'team_id,upcoming_match,rankings,updated_at')
                assert.equal(url.searchParams.get('team_id'), 'in.(101)')
                return Response.json([])
              }
              assert.equal(init.method, 'POST')
              assert.equal(url.searchParams.get('on_conflict'), 'team_id')
              assert.equal(url.searchParams.get('select'), 'team_id')
              assert.match(headers.get('prefer'), /resolution=merge-duplicates/)
              assert.match(headers.get('prefer'), /return=representation/)
              assert.equal(headers.get('accept'), 'application/vnd.pgrst.object+json')
              const write = JSON.parse(init.body)
              calls.writes.push(write)
              return Response.json({ team_id: write.team_id }, { status: 201 })
            } },
          })
        }
        return client
      },
    },
    '@/services/rbfa-sync': sync,
  }, {
    process: { env },
    console: {
      error: (...args) => calls.logs.push(['error', ...args]),
      info: (...args) => calls.logs.push(['info', ...args]),
    },
  })
  return {
    calls, route,
    async execute(authorization = `Bearer ${environment.CRON_SECRET}`) {
      const headers = authorization === null ? undefined : { authorization }
      const response = await route.GET(new Request('https://cron.synthetic.invalid/api/cron/rbfa', { headers }))
      const text = await response.text()
      let body
      try { body = JSON.parse(text) } catch { body = text }
      const publicOutput = JSON.stringify({ text, logs: calls.logs })
      for (const secret of [SCRAPER_KEY, SERVICE_KEY, PRIVATE_ERROR, environment.CRON_SECRET, environment.CRON_SECRET_2]) {
        assert.equal(publicOutput.includes(secret), false, 'A secret or raw provider detail was exposed')
      }
      return { status: response.status, body, text }
    },
  }
}

test('the cron remains dynamic with a 60-second Vercel execution allowance', () => {
  const { route } = cron()
  assert.equal(route.dynamic, 'force-dynamic')
  assert.equal(route.maxDuration, 60)
})

test('unauthorized requests stop before creating a client or issuing any request', async () => {
  for (const authorization of [null, '', 'Bearer incorrect', 'synthetic-cron-secret']) {
    const app = cron()
    assert.equal((await app.execute(authorization)).status, 401)
    assert.equal(app.calls.clients.length, 0)
    assert.equal(app.calls.queries.length, 0)
    assert.equal(app.calls.requests.length, 0)
    assert.equal(app.calls.logs.length, 0)
  }
  const app = cron({ env: { CRON_SECRET: undefined, CRON_SECRET_2: undefined } })
  assert.equal((await app.execute('Bearer undefined')).status, 401)
  assert.equal(app.calls.clients.length, 0)
})

test('both existing cron credentials authorize the same safe synchronization path', async () => {
  for (const authorization of [`Bearer ${environment.CRON_SECRET}`, `Bearer ${environment.CRON_SECRET_2}`]) {
    const app = cron()
    const result = await app.execute(authorization)
    assert.equal(result.status, 200)
    assert.equal(result.body.success, true)
    assert.equal(result.body.summary.writesSucceeded, 1)
  }
})

test('missing required configuration returns a safe error before client creation', async () => {
  for (const field of ['SCRAPER_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL']) {
    const app = cron({ env: { [field]: undefined } })
    assert.deepEqual(await app.execute(), {
      status: 500,
      body: { success: false, code: 'CONFIGURATION_ERROR' },
      text: '{"success":false,"code":"CONFIGURATION_ERROR"}',
    })
    assert.equal(app.calls.clients.length, 0)
    assert.equal(app.calls.requests.length, 0)
  }
})

test('profile team IDs are trimmed, deduplicated and selected without hard-coded clubs', async () => {
  const app = cron({ profiles: ['101', null, '102', '101', ' 102 ', ''] })
  const result = await app.execute()
  assert.equal(result.status, 200)
  assert.equal(result.body.summary.teams, 2)
  assert.deepEqual(app.calls.requests.map(request => request.teamId).sort(), ['101', '101', '102', '102'])
  assert.equal(app.calls.queries.filter(query => query.table === 'profiles').length, 1)
  const cacheRead = app.calls.queries.find(query => query.table === 'rbfa_cache' && !query.upsert)
  assert.deepEqual(Array.from(cacheRead.filter.values), ['101', '102'])
})

test('an empty set of linked teams succeeds without cache queries or external requests', async () => {
  const app = cron({ profiles: [null, '', ' '] })
  const result = await app.execute()
  assert.equal(result.status, 200)
  assert.equal(result.body.summary.teams, 0)
  assert.equal(app.calls.queries.length, 1)
  assert.equal(app.calls.requests.length, 0)
  assert.equal(app.calls.writes.length, 0)
})

test('Supabase profile and cache read errors cannot be reported as a successful empty synchronization', async () => {
  for (const failedTable of ['profiles', 'rbfa_cache']) {
    const app = cron({ databaseResponse(query) {
      if (query.table === failedTable) return { data: null, error: { message: PRIVATE_ERROR } }
    } })
    const result = await app.execute()
    assert.equal(result.status, 500)
    assert.deepEqual(result.body, { success: false, code: 'DATABASE_READ_ERROR' })
    assert.equal(app.calls.requests.length, 0)
    assert.equal(app.calls.writes.length, 0)
  }
})

test('two complete responses produce one acknowledged cache snapshot per team', async () => {
  const app = cron()
  const result = await app.execute()
  assert.equal(result.status, 200)
  assert.equal(result.body.summary.updated, 1)
  assert.equal(result.body.summary.writesSucceeded, 1)
  assert.deepEqual(app.calls.writes, [{
    team_id: '101', upcoming_match: upcomingMatch('101'), rankings: ranking('101'),
    updated_at: new Date(FIXED_NOW).toISOString(),
  }])
})

test('the installed Supabase SDK executes both reads and a returning upsert with abort signals and service authentication', async () => {
  const app = cron({ realSdk: true })
  const result = await app.execute()
  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
  assert.equal(result.body.summary.writesSucceeded, 1)
  assert.deepEqual(app.calls.databaseRequests, [
    { path: '/rest/v1/profiles', method: 'GET', select: 'rbfa_team_id' },
    { path: '/rest/v1/rbfa_cache', method: 'GET', select: 'team_id,upcoming_match,rankings,updated_at' },
    { path: '/rest/v1/rbfa_cache', method: 'POST', select: 'team_id' },
  ])
  assert.deepEqual(app.calls.writes, [{
    team_id: '101', upcoming_match: upcomingMatch('101'), rankings: ranking('101'),
    updated_at: new Date(FIXED_NOW).toISOString(),
  }])
})

test('an unchanged snapshot remains accounted for as unchanged with an acknowledged refresh', async () => {
  const app = cron({ cached: [{
    team_id: '101', upcoming_match: upcomingMatch('101'), rankings: ranking('101'),
    updated_at: '2026-10-18T12:00:00Z',
  }] })
  const result = await app.execute()
  assert.equal(result.status, 200)
  assert.equal(result.body.summary.updated, 0)
  assert.equal(result.body.summary.unchanged, 1)
  assert.equal(result.body.summary.writesSucceeded, 1)
  assert.equal(result.body.results[0].cache, 'refreshed')
})

test('refused writes, missing acknowledgements and wrong returned rows never count as successful writes', async () => {
  for (const databaseResult of [
    { data: null, error: { message: PRIVATE_ERROR } },
    { data: null, error: null },
    { data: { team_id: 'unexpected' }, error: null },
  ]) {
    const app = cron({ databaseResponse(query) { if (query.upsert) return databaseResult } })
    const result = await app.execute()
    assert.equal(result.status, 500)
    assert.equal(result.body.summary.writesSucceeded, 0)
    assert.equal(result.body.summary.writesFailed, 1)
    assert.equal(result.body.summary.failed, 1)
    assert.equal(result.body.results[0].reason, 'DATABASE_WRITE_ERROR')
    assert.equal(result.body.results[0].cache, 'unknown')
  }
})

test('a refused write for one team does not stop a later team from completing', async () => {
  const app = cron({ profiles: ['101', '102'], databaseResponse(query) {
    if (query.upsert?.team_id === '101') return { data: null, error: { message: PRIVATE_ERROR } }
  } })
  const result = await app.execute()
  assert.equal(result.status, 500)
  assert.equal(result.body.summary.failed, 1)
  assert.equal(result.body.summary.updated, 1)
  assert.equal(result.body.summary.writesFailed, 1)
  assert.equal(result.body.summary.writesSucceeded, 1)
  assert.deepEqual(result.body.results.map(team => [team.teamId, team.status]), [['101', 'failed'], ['102', 'updated']])
})

test('GraphQL errors preserve the failing team snapshot while a later team is synchronized', async () => {
  const app = cron({ profiles: ['101', '102'], fetchResponse({ teamId, operationName }) {
    return Response.json(teamId === '101'
      ? { ...successfulResponse(teamId, operationName), errors: [{ message: PRIVATE_ERROR }] }
      : successfulResponse(teamId, operationName))
  } })
  const result = await app.execute()
  assert.equal(result.status, 500)
  assert.equal(result.body.summary.failed, 1)
  assert.equal(result.body.summary.writesSucceeded, 1)
  assert.equal(result.body.summary.writesFailed, 0)
  assert.deepEqual(app.calls.writes.map(row => row.team_id), ['102'])
  assert.equal(result.body.results[0].cache, 'preserved')
  assert.equal(result.body.results[0].reason, 'GRAPHQL_ERROR')
})

test('partial successful HTTP responses never authorize an upsert or a false empty next match', async () => {
  for (const invalidOperation of ['GetUpcomingMatch', 'getSeriesAndRankingsQuery']) {
    const app = cron({ fetchResponse({ teamId, operationName }) {
      return Response.json(operationName === invalidOperation ? { data: {} } : successfulResponse(teamId, operationName))
    } })
    const result = await app.execute()
    assert.equal(result.status, 500)
    assert.equal(result.body.results[0].reason, 'INVALID_RESPONSE')
    assert.equal(result.body.results[0].cache, 'preserved')
    assert.equal(app.calls.writes.length, 0)
  }
})

test('an explicit successful absence of next match and ranking replaces a previous snapshot with nulls', async () => {
  const app = cron({ cached: [{
    team_id: '101', upcoming_match: upcomingMatch('101'), rankings: ranking('101'), updated_at: null,
  }], fetchResponse({ operationName }) {
    return Response.json(operationName === 'GetUpcomingMatch'
      ? { data: { upcomingMatch: null } }
      : { data: { teamSeriesAndRankings: { rankings: [] } } })
  } })
  const result = await app.execute()
  assert.equal(result.status, 200)
  assert.equal(app.calls.writes.length, 1)
  assert.equal(app.calls.writes[0].upcoming_match, null)
  assert.equal(app.calls.writes[0].rankings, null)
})

test('raw HTTP provider bodies, transport URLs and client errors are absent from public output and logs', async () => {
  const leakingError = new Error(`https://api.scraperapi.com?api_key=${SCRAPER_KEY}&detail=${PRIVATE_ERROR}`)
  for (const options of [
    { fetchResponse() { return new Response(`${PRIVATE_ERROR} ${SCRAPER_KEY}`, { status: 429 }) } },
    { fetchResponse() { throw leakingError } },
    { clientError: new Error(`${SERVICE_KEY} ${PRIVATE_ERROR}`) },
  ]) {
    const app = cron(options)
    const result = await app.execute()
    assert.equal(result.status, 500)
    assert.equal(app.calls.writes.length, 0)
    assert.equal(JSON.stringify({ result, logs: app.calls.logs }).includes('https://api.scraperapi.com?'), false)
  }
})
