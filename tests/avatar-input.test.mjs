import assert from 'node:assert/strict'
import { cssModuleMock } from './helpers/load-ui-module.mjs'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import ts from 'typescript'
import {
  AVATAR_ACCEPT,
  AVATAR_SIZE_LABEL,
  MAX_AVATAR_SIZE_BYTES,
  getAvatarExtension,
  getAvatarFileError,
} from '../src/utils/avatar.ts'
import nextConfig from '../next.config.mjs'

const require = createRequire(import.meta.url)
const image = (size, type = 'image/png', name = 'synthetic.png') =>
  new File([new Uint8Array(size)], name, { type })

test('the avatar file limit is four MiB and accepts the exact boundary', () => {
  assert.equal(MAX_AVATAR_SIZE_BYTES, 4 * 1024 * 1024)
  assert.equal(AVATAR_SIZE_LABEL, '4 Mio')
  for (const size of [MAX_AVATAR_SIZE_BYTES - 1, MAX_AVATAR_SIZE_BYTES]) {
    assert.equal(getAvatarFileError(image(size)), null)
  }
  assert.match(getAvatarFileError(image(MAX_AVATAR_SIZE_BYTES + 1)), /4 Mio/)
})

test('valid avatar MIME types retain their generated safe extension', () => {
  for (const [mime, extension] of [
    ['image/jpeg', 'jpg'], ['image/jpg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ]) {
    assert.equal(getAvatarExtension(mime), extension)
    assert.equal(getAvatarFileError(image(1, mime, '../../untrusted.exe')), null)
    assert.ok(AVATAR_ACCEPT.split(',').includes(mime))
  }
})

test('unsupported MIME types and inherited object properties cannot select an extension', () => {
  for (const mime of ['', 'image/gif', 'image/svg+xml', 'image/heic', 'application/octet-stream',
    'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(getAvatarExtension(mime), undefined)
    assert.match(getAvatarFileError(image(1, mime)), /format JPG, PNG ou WebP/)
  }
})

test('only optional avatars accept a missing or empty browser file', () => {
  for (const value of [null, new File([], ''), image(0)]) {
    assert.equal(getAvatarFileError(value, true), null)
    assert.match(getAvatarFileError(value), /Sélectionne une image/)
  }
  for (const value of ['', 'not-a-file']) {
    assert.match(getAvatarFileError(value, true), /Sélectionne une image JPG, PNG ou WebP/)
    assert.match(getAvatarFileError(value), /Sélectionne une image JPG, PNG ou WebP/)
  }
})

function avatarComponent(props = {}) {
  let state = null
  const path = 'src/components/AvatarInput.tsx'
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText
  const loadedModule = { exports: {} }
  const context = vm.createContext({
    module: loadedModule, exports: loadedModule.exports,
    require(name) {
      if (name.endsWith('.module.css')) return cssModuleMock
      if (name === 'react') return {
        useState: () => [state, value => { state = value }],
        useId: () => 'synthetic-avatar-error',
      }
      if (name === 'react/jsx-runtime') return require(name)
      if (name === '@/utils/avatar') return { AVATAR_ACCEPT, getAvatarFileError }
      throw new Error(`Unexpected avatar component dependency: ${name}`)
    },
  })
  new vm.Script(compiled, { filename: path }).runInContext(context)
  const render = () => {
    const tree = loadedModule.exports.default({ id: 'avatar', className: 'synthetic-class', ...props })
    const nodes = React.Children.toArray(tree.props.children)
    return {
      input: nodes.find(node => React.isValidElement(node) && node.type === 'input'),
      alert: nodes.find(node => React.isValidElement(node) && node.props.role === 'alert'),
    }
  }
  const input = {
    files: [], validityMessage: '', reports: 0,
    setCustomValidity(message) { this.validityMessage = message },
    reportValidity() { this.reports += 1; return !this.validityMessage },
  }
  return {
    render, input,
    select(file) {
      input.files = file === null ? [] : [file]
      render().input.props.onChange({ currentTarget: input })
      return render()
    },
  }
}

test('the real avatar component rejects oversized selections before form submission and recovers after replacement', () => {
  const component = avatarComponent({ required: true })
  const initial = component.render()
  assert.equal(initial.input.props.type, 'file')
  assert.equal(initial.input.props.name, 'avatar')
  assert.equal(initial.input.props.id, 'avatar')
  assert.equal(initial.input.props.accept, AVATAR_ACCEPT)
  assert.equal(initial.input.props.required, true)
  assert.equal(initial.input.props.className, 'synthetic-class')
  assert.equal(initial.input.props['aria-invalid'], undefined)
  assert.equal(initial.alert, undefined)

  const rejected = component.select(image(MAX_AVATAR_SIZE_BYTES + 1))
  assert.match(component.input.validityMessage, /4 Mio/)
  assert.equal(component.input.reports, 1)
  assert.equal(rejected.input.props['aria-invalid'], true)
  assert.equal(rejected.input.props['aria-describedby'], rejected.alert.props.id)
  assert.equal(rejected.alert.props.children, component.input.validityMessage)

  const accepted = component.select(image(MAX_AVATAR_SIZE_BYTES))
  assert.equal(component.input.validityMessage, '')
  assert.equal(component.input.reports, 1)
  assert.equal(accepted.input.props['aria-invalid'], undefined)
  assert.equal(accepted.input.props['aria-describedby'], undefined)
  assert.equal(accepted.alert, undefined)
})

test('the avatar component clears optional errors when a file is removed and retains the required selection rule', () => {
  const optional = avatarComponent()
  assert.equal(optional.render().input.props.required, false)
  assert.match(optional.select(image(1, 'image/svg+xml')).alert.props.children, /format JPG, PNG ou WebP/)
  assert.equal(optional.input.reports, 1)
  assert.equal(optional.select(null).alert, undefined)
  assert.equal(optional.input.validityMessage, '')
  assert.equal(optional.input.reports, 1)

  const required = avatarComponent({ required: true })
  required.select(image(1))
  assert.match(required.select(null).alert.props.children, /Sélectionne une image/)
  assert.match(required.input.validityMessage, /Sélectionne une image/)
  assert.equal(required.input.reports, 1)
  assert.equal(required.select(image(1, 'image/jpeg')).alert, undefined)
  assert.equal(required.input.validityMessage, '')
})

test('a real four-MiB multipart registration body keeps room for long names and action metadata', async () => {
  const data = new FormData()
  for (const [name, value] of Object.entries({
    display_name: 'é'.repeat(50), club: 'é'.repeat(100), category: 'é'.repeat(50),
    preferred_position: 'MDC', foot_preference: 'Ambidextre', jersey_number: '99',
    height: '250', weight: '150', email: 'synthetic@example.invalid', password: 'x'.repeat(1024),
    // Conservative allowance for React Server Action state/metadata. This is a
    // local encoding test, not a claim about arbitrary unbounded form fields.
    '$ACTION_0': 'x'.repeat(64 * 1024),
  })) data.set(name, value)
  data.set('avatar', image(MAX_AVATAR_SIZE_BYTES, 'image/png', `${'é⚽'.repeat(100)}.png`))

  // Constructing and encoding a Request never sends it: no fetch, network,
  // Supabase client, account, real file or .env is used in this test.
  const request = new Request('https://local-encoding.example.invalid/', { method: 'POST', body: data })
  assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/)
  const encodedSize = (await request.arrayBuffer()).byteLength
  assert.ok(encodedSize > MAX_AVATAR_SIZE_BYTES + 64 * 1024)
  assert.ok(encodedSize < MAX_AVATAR_SIZE_BYTES + 96 * 1024)
  assert.ok(encodedSize < 4_500_000, 'the synthetic multipart body fits below 4.5 decimal MB')
})

test('Next.js accepts a four-MiB multipart Server Action with the project body limit', { timeout: 90_000 }, async t => {
  assert.equal(require('next/package.json').version, '16.2.5')
  const bodySizeLimit = nextConfig.experimental.serverActions.bodySizeLimit
  const bodySizeLimitBytes = require('next/dist/compiled/bytes').parse(bodySizeLimit)
  assert.ok(bodySizeLimitBytes > MAX_AVATAR_SIZE_BYTES)

  // An independent JS fixture avoids loading the app's .env.local, Auth,
  // Storage, fonts or database clients. Only the real Next server and parser
  // are used; webpack avoids following node_modules outside Turbopack's root.
  const directory = mkdtempSync(join(tmpdir(), 'footstats-action-body-'))
  mkdirSync(join(directory, 'app'))
  symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(directory, 'node_modules'), 'dir')
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: 'footstats-isolated-action-test', private: true,
    dependencies: { next: '16.2.5', react: '19.2.4', 'react-dom': '19.2.4' },
  }))
  writeFileSync(join(directory, 'next.config.mjs'), `export default ${JSON.stringify({
    experimental: { serverActions: { bodySizeLimit } },
    devIndicators: false,
  })}`)
  writeFileSync(join(directory, 'app/layout.js'), 'export default function Layout({children}) { return <html><body>{children}</body></html> }')
  writeFileSync(join(directory, 'app/page.js'), `
    import { redirect } from 'next/navigation'
    async function receiveAvatar(data) {
      'use server'
      const file = data.get('avatar')
      const metadata = data.get('synthetic_metadata')
      redirect('/?bytes=' + file.size + '&metadata=' + metadata.length + '&name=' + data.get('display_name').length)
    }
    export default function Page() { return <form action={receiveAvatar}><input name="avatar" type="file" /></form> }
  `)

  const server = spawn(process.execPath, [
    fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)),
    'dev', directory, '--webpack', '--hostname', '127.0.0.1', '--port', '0',
  ], {
    cwd: directory,
    // Never inherit production tokens, connection strings or NODE_OPTIONS.
    env: { PATH: process.env.PATH, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let spawnError = null
  server.on('error', error => { spawnError = error })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', chunk => { output = (output + chunk.toString()).slice(-32_768) })
  }
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit')
      server.kill('SIGTERM')
      let timer
      const stopped = await Promise.race([
        exited.then(() => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000) }),
      ])
      clearTimeout(timer)
      if (!stopped) {
        server.kill('SIGKILL')
        await exited
      }
    }
    rmSync(directory, { recursive: true, force: true })
  })

  const deadline = Date.now() + 60_000
  while (!/Ready in/.test(output) && Date.now() < deadline) {
    if (spawnError) throw spawnError
    if (server.exitCode !== null) assert.fail(`Isolated Next server failed: ${output}`)
    await delay(50)
  }
  assert.match(output, /Ready in/, `Isolated Next server did not start: ${output}`)
  const port = output.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/)?.[1]
  assert.ok(port, 'only a loopback address from the isolated server is used')
  const origin = `http://127.0.0.1:${port}`
  const page = await fetch(origin, { signal: AbortSignal.timeout(30_000) })
  assert.equal(page.status, 200)
  const html = await page.text()
  const actionName = html.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1]
  assert.ok(actionName, 'use the actual server reference emitted by Next')

  const data = new FormData()
  data.set(actionName, '')
  data.set('display_name', 'é'.repeat(50))
  data.set('club', 'é'.repeat(100))
  data.set('category', 'é'.repeat(50))
  data.set('email', 'synthetic@example.invalid')
  data.set('password', 'x'.repeat(1024))
  data.set('synthetic_metadata', 'x'.repeat(64 * 1024))
  data.set('avatar', image(MAX_AVATAR_SIZE_BYTES, 'image/png', `${'é⚽'.repeat(100)}.png`))
  const request = new Request(origin, {
    method: 'POST', headers: { Origin: origin }, body: data,
    redirect: 'manual', signal: AbortSignal.timeout(30_000),
  })
  const encodedSize = (await request.clone().arrayBuffer()).byteLength
  assert.ok(encodedSize > 1024 * 1024, 'the default one-MB limit would be insufficient')
  assert.ok(encodedSize < bodySizeLimitBytes, 'the complete multipart fits the configured Next limit')
  assert.ok(encodedSize < 4_500_000, 'the complete multipart also fits below the documented Vercel limit')

  const response = await fetch(request)
  assert.equal(response.status, 303, `the Server Action must execute successfully, not return 413: ${output}`)
  const result = new URL(response.headers.get('location'), origin)
  assert.equal(result.searchParams.get('bytes'), String(MAX_AVATAR_SIZE_BYTES))
  assert.equal(result.searchParams.get('metadata'), String(64 * 1024))
  assert.equal(result.searchParams.get('name'), '50')
  await response.arrayBuffer()
  t.diagnostic(`Next limit: ${bodySizeLimitBytes} bytes; full multipart: ${encodedSize} bytes; accepted avatar: ${MAX_AVATAR_SIZE_BYTES} bytes.`)
})
