import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { parseProfileFormData } from '../src/utils/profile-form.ts'

const require = createRequire(import.meta.url)
const ID = '00000000-0000-4000-8000-000000000001'
const INITIAL = { status: 'idle', message: '' }
const validProfile = {
  display_name: 'Synthetic player', club: '', category: '', preferred_position: '',
  foot_preference: '', jersey_number: '', height: '', weight: '',
}

function form(overrides = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    ...validProfile, email: 'synthetic@example.invalid', password: 'synthetic-password', ...overrides,
  })) data.set(key, value)
  return data
}

function load(relativePath, mocks, globals = {}) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: relativePath,
  }).outputText
  const loadedModule = { exports: {} }
  const context = vm.createContext({
    module: loadedModule, exports: loadedModule.exports, FormData, File, crypto,
    ...globals,
    require(name) {
      if (name in mocks) return mocks[name]
      if (['zod', 'react', 'react/jsx-runtime'].includes(name)) return require(name)
      throw new Error(`Unexpected registration dependency: ${name}`)
    },
  })
  new vm.Script(compiled, { filename: relativePath }).runInContext(context)
  return loadedModule.exports
}

function fixture(options = {}) {
  const calls = []
  const logs = []
  const client = {
    auth: { async signUp(credentials) {
      calls.push({ operation: 'signUp', credentials })
      if (options.authThrows) throw options.authThrows
      return options.authResult ?? {
        data: { user: { id: ID, identities: [{}] }, session: { access_token: 'synthetic-token' } },
        error: null,
      }
    } },
    storage: { from(bucket) {
      return {
        async upload(path, file, settings) {
          calls.push({ operation: 'upload', bucket, path, file, settings })
          return { error: options.uploadError ?? null }
        },
        getPublicUrl(path) { return { data: { publicUrl: `https://storage.example.invalid/${path}` } } },
      }
    } },
    from(table) {
      const builder = {
        update(payload) { calls.push({ operation: 'update', table, payload }); return builder },
        eq(column, value) { calls.push({ operation: 'eq', column, value }); return builder },
        select(value) { calls.push({ operation: 'select', value }); return builder },
        async maybeSingle() {
          if (options.profileThrows) throw options.profileThrows
          return {
            data: options.missingProfile ? null : { id: ID },
            error: options.profileError ?? null,
          }
        },
      }
      return builder
    },
  }
  const actions = load('src/app/register/actions.ts', {
    '@/utils/supabase/server': { async createClient() { calls.push({ operation: 'createClient' }); return client } },
    '@/utils/profile-form': { parseProfileFormData },
    'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`) } },
    'next/cache': { revalidatePath(...args) { calls.push({ operation: 'revalidatePath', args }) } },
  }, { console: { error(...args) { logs.push(args) } } })
  return { ...actions, calls, logs }
}

test('registration rejects invalid inputs before Auth, profile or Storage writes', async t => {
  const invalid = [
    ['display_name', 'x'], ['display_name', 'x'.repeat(51)],
    ['club', 'x'.repeat(101)], ['category', 'x'.repeat(51)],
    ['preferred_position', 'INVALID'], ['foot_preference', 'INVALID'],
    ['jersey_number', '1.5'], ['jersey_number', '12abc'], ['jersey_number', '0'], ['jersey_number', '100'],
    ['height', '179.5'], ['height', '99'], ['height', '251'],
    ['weight', '70.5'], ['weight', '29'], ['weight', '151'],
    ['email', 'invalid'], ['password', 'short'],
    ['avatar', 'not-a-file'],
    ['avatar', new File(['image'], 'image.svg', { type: 'image/svg+xml' })],
    ['avatar', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'image.png', { type: 'image/png' })],
    ['display_name', new File(['value'], 'name.txt')],
  ]
  for (const [key, value] of invalid) {
    await t.test(`${key}: ${typeof value === 'string' ? value.slice(0, 16) : 'file'}`, async () => {
      const f = fixture()
      const state = await f.registerUser(INITIAL, form({ [key]: value }))
      assert.equal(state.status, 'error')
      assert.ok(state.fieldErrors[key]?.length)
      assert.equal(f.calls.length, 0)
      assert.equal(f.logs.length, 0)
    })
  }
})

test('valid registration trims profile/email, preserves password, nullable values and owner filter', async () => {
  const f = fixture()
  const password = ` ${'x'.repeat(100)} `
  await assert.rejects(f.registerUser(INITIAL, form({
    display_name: '  Synthetic player  ', email: ' synthetic@example.invalid ', password,
    club: '  Synthetic club ', category: ' Senior ', preferred_position: 'DG',
    foot_preference: 'Gaucher', jersey_number: '12', height: '180', weight: '70',
  })), /REDIRECT:\/dashboard/)
  const signup = f.calls.find(call => call.operation === 'signUp')
  assert.equal(signup.credentials.email, 'synthetic@example.invalid')
  assert.equal(signup.credentials.password, password)
  const payload = f.calls.find(call => call.operation === 'update').payload
  assert.equal(payload.display_name, 'Synthetic player')
  assert.equal(payload.club, 'Synthetic club')
  assert.equal(payload.jersey_number, 12)
  assert.equal(payload.height, 180)
  assert.equal(payload.weight, 70)
  assert.equal(payload.preferred_position, 'DG')
  assert.equal(Object.hasOwn(payload, 'rbfa_team_id'), false)
  assert.ok(f.calls.some(call => call.operation === 'eq' && call.column === 'id' && call.value === ID))
  assert.ok(f.calls.some(call => call.operation === 'revalidatePath'))
})

test('blank optional fields and an empty browser file remain valid', async () => {
  const f = fixture()
  await assert.rejects(f.registerUser(INITIAL, form({ avatar: new File([], '') })), /REDIRECT:\/dashboard/)
  const payload = f.calls.find(call => call.operation === 'update').payload
  for (const key of Object.keys(validProfile).filter(key => key !== 'display_name')) assert.equal(payload[key], null)
  assert.equal(f.calls.some(call => call.operation === 'upload'), false)
})

test('valid avatar uses the validated MIME extension and current user folder', async () => {
  const f = fixture()
  await assert.rejects(f.registerUser(INITIAL, form({
    avatar: new File(['synthetic'], '../../image.exe', { type: 'image/png' }),
  })), /REDIRECT:\/dashboard/)
  const upload = f.calls.find(call => call.operation === 'upload')
  assert.match(upload.path, new RegExp(`^${ID}/[a-f0-9-]+\\.png$`))
  assert.equal(upload.bucket, 'avatars')
  assert.match(f.calls.find(call => call.operation === 'update').payload.avatar_url, /\.png$/)
})

test('Auth errors become actionable messages without exposing raw technical errors', async t => {
  for (const [error, message] of [
    [{ code: 'user_already_exists', message: 'sensitive synthetic@example.invalid' }, /déjà utilisée/],
    [{ code: 'weak_password', message: 'sensitive' }, /plus fort/],
    [{ status: 429, message: 'sensitive' }, /Patiente/],
    [{ code: 'signup_disabled', message: 'sensitive' }, /désactivées/],
    [{ code: 'unexpected', message: 'sensitive' }, /échoué/],
  ]) {
    await t.test(String(error.code ?? error.status), async () => {
      const f = fixture({ authResult: { data: { user: null, session: null }, error } })
      const state = await f.registerUser(INITIAL, form())
      assert.equal(state.status, 'error')
      assert.match(state.message, message)
      assert.doesNotMatch(JSON.stringify([state, f.logs]), /sensitive|synthetic@example|synthetic-password/)
      assert.equal(f.calls.some(call => call.operation === 'update' || call.operation === 'upload'), false)
      assert.equal(f.logs.length, 1)
    })
  }
})

test('an Auth response without a user is an error, not a dashboard redirect', async () => {
  const f = fixture({ authResult: { data: { user: null, session: null }, error: null } })
  assert.equal((await f.registerUser(INITIAL, form())).status, 'error')
})

test('confirmation-required and obfuscated existing accounts never attempt owner-only writes', async t => {
  for (const data of [
    { user: { id: ID, identities: [{}] }, session: null },
    { user: { id: ID, identities: [] }, session: null },
  ]) {
    await t.test(data.user.identities.length ? 'confirmation required' : 'obfuscated account', async () => {
      const f = fixture({ authResult: { data, error: null } })
      const state = await f.registerUser(INITIAL, form())
      assert.equal(state.accountCreated, true)
      assert.equal(state.needsConfirmation, true)
      assert.match(state.message, /confirmation/)
      assert.match(state.message, /paramètres/)
      assert.equal(f.calls.some(call => ['update', 'upload', 'revalidatePath'].includes(call.operation)), false)
      const callsBefore = f.calls.length
      assert.equal(await f.registerUser(state, form()), state)
      assert.equal(f.calls.length, callsBefore)
      assert.doesNotMatch(JSON.stringify(state), /synthetic-token|synthetic-password/)
    })
  }
})

test('failed or missing profile writes report an existing account and prevent duplicate signup', async t => {
  for (const options of [
    { profileError: { code: '42501', message: 'private profile details' } },
    { missingProfile: true },
    { profileThrows: new Error('private network details') },
  ]) {
    await t.test(Object.keys(options)[0], async () => {
      const f = fixture(options)
      const state = await f.registerUser(INITIAL, form())
      assert.equal(state.status, 'error')
      assert.equal(state.accountCreated, true)
      assert.match(state.message, /compte a été créé/)
      assert.match(state.message, /paramètres/)
      assert.doesNotMatch(JSON.stringify([state, f.logs]), /private|synthetic-token|synthetic-password/)
      const callsBefore = f.calls.length
      await f.registerUser(state, form())
      assert.equal(f.calls.length, callsBefore)
    })
  }
})

test('failed avatar upload still saves the rest of the profile and reports the missing photo', async () => {
  const f = fixture({ uploadError: { code: 'UPLOAD_FAILED', message: 'private upload details' } })
  const state = await f.registerUser(INITIAL, form({ avatar: new File(['image'], 'photo.png', { type: 'image/png' }) }))
  assert.equal(state.status, 'error')
  assert.equal(state.accountCreated, true)
  assert.match(state.message, /photo/)
  assert.ok(f.calls.some(call => call.operation === 'update'))
  assert.equal(Object.hasOwn(f.calls.find(call => call.operation === 'update').payload, 'avatar_url'), false)
  assert.doesNotMatch(JSON.stringify([state, f.logs]), /private upload/)
})

test('network failure during signup is shown without exposing credentials or raw errors', async () => {
  const f = fixture({ authThrows: new Error('private upstream details') })
  const state = await f.registerUser(INITIAL, form())
  assert.equal(state.status, 'error')
  assert.match(state.message, /momentanément indisponible/)
  assert.doesNotMatch(JSON.stringify([state, f.logs]), /private|synthetic-password|synthetic@example/)
})

function renderWizard(state = INITIAL, step = 4) {
  const forms = []
  const jsxRuntime = require('react/jsx-runtime')
  const wrapJsx = original => (type, props, ...args) => {
    if (type === 'form') forms.push(props)
    return original(type, props, ...args)
  }
  const moduleComponent = component => ({ __esModule: true, default: component })
  const MotionDiv = ({ children, className }) => React.createElement('div', { className }, children)
  const fakeReact = { ...React,
    useState(initial) { return [typeof initial === 'number' ? step : validProfile, () => {}] },
    useActionState() { return [state, () => {}, false] },
  }
  const feedback = load('src/components/ActionForm.tsx', {
    react: fakeReact,
    '@/utils/formState': { EMPTY_FORM_STATE: INITIAL },
  }).FormFeedback
  const page = load('src/app/register/page.tsx', {
    react: fakeReact,
    'react/jsx-runtime': { ...jsxRuntime, jsx: wrapJsx(jsxRuntime.jsx), jsxs: wrapJsx(jsxRuntime.jsxs) },
    'framer-motion': { motion: { div: MotionDiv }, AnimatePresence: ({ children }) => children },
    './actions': { registerUser() {} },
    '@/utils/formState': { EMPTY_FORM_STATE: INITIAL },
    '@/components/ActionForm': { FormFeedback: feedback },
    '@/app/dashboard/components/SubmitButton': moduleComponent(() => React.createElement('button', { type: 'submit' }, 'Créer le profil')),
    'next/link': moduleComponent(({ children, ...props }) => React.createElement('a', props, children)),
    '@/data/belgian_clubs.json': [],
  })
  return { html: renderToStaticMarkup(React.createElement(page.default)), forms }
}

test('wizard displays validation/Auth feedback and prevents React from resetting submitted fields', () => {
  const { html, forms } = renderWizard({ status: 'error', message: 'Vérifie les champs.', fieldErrors: { height: ['La taille doit être entière.'] } })
  assert.match(html, /role="alert"/)
  assert.match(html, /Vérifie les champs/)
  assert.match(html, /La taille doit être entière/)
  assert.match(html, /name="email"/)
  assert.match(html, /name="password"/)
  let prevented = false
  forms[0].onReset({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
})

test('wizard does not offer another signup after account creation and exposes recovery links', () => {
  const { html } = renderWizard({ status: 'error', message: 'Profil incomplet.', accountCreated: true })
  assert.match(html, /Profil incomplet/)
  assert.match(html, /href="\/dashboard\/settings"/)
  assert.doesNotMatch(html, /<form|Créer le profil/)
  const confirmation = renderWizard({ status: 'success', message: 'Confirme ton adresse.', accountCreated: true, needsConfirmation: true }).html
  assert.match(confirmation, /role="status"/)
  assert.match(confirmation, /href="\/login"/)
  assert.doesNotMatch(confirmation, /<form|href="\/dashboard\/settings"/)
})
