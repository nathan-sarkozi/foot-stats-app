import assert from 'node:assert/strict'
import { cssModuleMock } from './helpers/load-ui-module.mjs'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as matchForm from '../src/app/dashboard/match-form.ts'
import * as profileForm from '../src/utils/profile-form.ts'
import { EMPTY_FORM_STATE } from '../src/utils/formState.ts'
import * as readErrors from '../src/utils/readErrors.ts'
import * as avatar from '../src/utils/avatar.ts'

// Offline action/component regression tests. Only synthetic data is used;
// Supabase, navigation and storage transports never reach the network.
// Run: node --test --test-isolation=none tests/form-actions.test.mjs
const require = createRequire(import.meta.url)
const matchId = '20000000-0000-4000-8000-000000000001'
const otherMatchId = '20000000-0000-4000-8000-000000000002'
const playerId = '10000000-0000-4000-8000-000000000001'
const fileId = '40000000-0000-4000-8000-000000000001'

function loadModule(path, mocks = {}, globals = {}) {
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
    module: sourceModule, exports: sourceModule.exports,
    File, FormData, crypto: { randomUUID: () => fileId }, console: { error() {} },
    ...globals,
    require(name) {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.module.css')) return cssModuleMock
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      throw new Error(`Unexpected mocked action import: ${name}`)
    },
  })
  new vm.Script(compiled, { filename: path }).runInContext(context)
  return sourceModule.exports
}

function form(values) {
  const result = new FormData()
  for (const [name, value] of Object.entries(values)) {
    if (value !== null) result.set(name, value)
  }
  return result
}

const matchData = changes => form({
  match_id: matchId, match_date: '2026-10-19', opponent: 'Synthetic opponent',
  competition_type: 'LEAGUE', team_score: '2', opponent_score: '1',
  has_played: 'true', is_motm: 'on', position_played: 'MC',
  minutes_played: '80', goals: '1', assists: '2', yellow_cards: '0', red_cards: '0',
  ...changes,
})
const profileData = changes => form({
  display_name: 'Synthetic player', club: '', category: '', preferred_position: '',
  foot_preference: '', jersey_number: '', height: '', weight: '', rbfa_team_id: '',
  ...changes,
})
const avatarData = file => {
  const result = new FormData()
  if (file !== null) result.set('avatar', file)
  return result
}

function actions(options = {}) {
  const calls = { rpc: [], queries: [], uploads: [], revalidation: [], redirects: [], logs: [] }
  const user = options.user === undefined ? { id: playerId } : options.user
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: options.authError ?? null }) },
    async rpc(name, payload) {
      calls.rpc.push({ name, payload })
      return { data: options.rpcData === undefined ? matchId : options.rpcData, error: options.rpcError ?? null }
    },
    from(table) {
      const query = { table, filters: [] }
      calls.queries.push(query)
      const builder = {
        update(payload) { query.operation = 'update'; query.payload = payload; return builder },
        delete() { query.operation = 'delete'; return builder },
        eq(name, value) { query.filters.push({ name, value }); return builder },
        select(value) { query.select = value; return builder },
        async maybeSingle() {
          return {
            data: options.row === undefined ? { id: table === 'matches' ? matchId : playerId } : options.row,
            error: options.dbError ?? null,
          }
        },
      }
      return builder
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'avatars')
        return {
          async upload(path, file, uploadOptions) {
            calls.uploads.push({ path, file, options: uploadOptions })
            return { error: options.uploadError ?? null }
          },
          getPublicUrl(path) { return { data: { publicUrl: `https://storage.invalid/avatars/${path}` } } },
        }
      },
    },
  }
  const mocks = {
    '@/utils/supabase/server': { createClient: async () => client },
    '@/utils/profile-form': profileForm,
    '@/utils/avatar': avatar,
    '../match-form': matchForm, '../../match-form': matchForm,
    'next/cache': { revalidatePath(...args) { calls.revalidation.push(args) } },
    'next/navigation': { redirect(path) { calls.redirects.push(path); throw new Error(`REDIRECT:${path}`) } },
  }
  const globals = { console: { error(...args) { calls.logs.push(args) } } }
  const add = loadModule('src/app/dashboard/add-match/actions.ts', mocks, globals)
  const edit = loadModule('src/app/dashboard/edit-match/[id]/actions.ts', mocks, globals)
  const settings = loadModule('src/app/dashboard/settings/actions.ts', mocks, globals)
  return { ...add, ...edit, ...settings, calls }
}

function expectError(state, calls) {
  assert.equal(state.status, 'error')
  assert.ok(state.message)
  assert.doesNotMatch(state.message, /synthetic backend detail|42501|PGRST/)
  assert.equal(calls.revalidation.length, 0)
  assert.equal(calls.redirects.length, 0)
}

function expectRedirect(calls, path) {
  assert.deepEqual(calls.revalidation, [['/', 'layout']])
  assert.deepEqual(calls.redirects, [path])
}

test('all match/profile/avatar actions return an expired-session message before accessing data', async () => {
  const harness = actions({ user: null })
  for (const action of [harness.addMatch, harness.updateMatch, harness.deleteMatch,
    harness.updateProfile, harness.updateAvatar]) {
    expectError(await action(EMPTY_FORM_STATE, new FormData()), harness.calls)
  }
  assert.equal(harness.calls.rpc.length, 0)
  assert.equal(harness.calls.queries.length, 0)
  assert.equal(harness.calls.uploads.length, 0)
})

test('failed authentication never authorizes a mutation even with a returned user', async () => {
  const harness = actions({ authError: { name: 'AuthRetryableFetchError', status: 503 } })
  for (const action of [harness.addMatch, harness.updateMatch, harness.deleteMatch,
    harness.updateProfile, harness.updateAvatar]) {
    expectError(await action(EMPTY_FORM_STATE, new FormData()), harness.calls)
  }
  assert.equal(harness.calls.rpc.length, 0)
  assert.equal(harness.calls.queries.length, 0)
  assert.equal(harness.calls.uploads.length, 0)
  assert.equal(harness.calls.logs.length, 5)
})

test('invalid match fields remain form errors without any RPC or redirect', async () => {
  for (const field of [{ match_date: '2026-02-30' }, { goals: '1.5' }, { minutes_played: '121' },
    { has_played: null, yellow_cards: '3' }, { has_played: null, red_cards: '2' }]) {
    const harness = actions()
    for (const action of [harness.addMatch, harness.updateMatch]) {
      expectError(await action(EMPTY_FORM_STATE, matchData(field)), harness.calls)
    }
    assert.equal(harness.calls.rpc.length, 0)
  }
})

test('editing and deletion reject invalid identifiers before any mutation', async () => {
  for (const name of ['updateMatch', 'deleteMatch']) {
    const harness = actions()
    expectError(await harness[name](EMPTY_FORM_STATE, matchData({ match_id: 'invalid' })), harness.calls)
    assert.equal(harness.calls.rpc.length + harness.calls.queries.length, 0)
  }
})

for (const name of ['addMatch', 'updateMatch']) {
  test(`${name}: RPC errors are returned without leaking backend details or losing the form`, async () => {
    const harness = actions({ rpcError: { code: '42501', message: 'synthetic backend detail' } })
    expectError(await harness[name](EMPTY_FORM_STATE, matchData()), harness.calls)
    assert.equal(harness.calls.rpc.length, 1)
  })

  test(`${name}: an invalid RPC result is not reported as success`, async () => {
    const harness = actions({ rpcData: null })
    expectError(await harness[name](EMPTY_FORM_STATE, matchData()), harness.calls)
  })
}

test('creation keeps bench sanctions while passing only validated atomic-write fields', async () => {
  const harness = actions()
  await assert.rejects(harness.addMatch(EMPTY_FORM_STATE, matchData({
    has_played: null, yellow_cards: '2', red_cards: '1', player_id: 'forged-owner', stat_id: 'forged-stat',
  })), { message: 'REDIRECT:/dashboard' })
  const { name, payload } = harness.calls.rpc[0]
  assert.equal(name, 'save_match_with_statistics')
  assert.equal(payload.p_has_played, false)
  for (const field of ['p_minutes_played', 'p_goals', 'p_assists']) assert.equal(payload[field], 0)
  assert.equal(payload.p_is_motm, false)
  assert.equal(payload.p_position_played, null)
  assert.equal(payload.p_yellow_cards, 2)
  assert.equal(payload.p_red_cards, 1)
  for (const field of ['p_match_id', 'p_player_id', 'stat_id']) assert.equal(field in payload, false)
  expectRedirect(harness.calls, '/dashboard')
})

test('creation and editing normalize two yellows to a single expulsion, including non-participants', async () => {
  for (const name of ['addMatch', 'updateMatch']) {
    for (const participation of ['true', null]) {
      const harness = actions()
      await assert.rejects(harness[name](EMPTY_FORM_STATE, matchData({ has_played: participation, yellow_cards: '2', red_cards: '0' })), { message: 'REDIRECT:/dashboard' })
      const payload = harness.calls.rpc[0].payload
      assert.equal(payload.p_yellow_cards, 2)
      assert.equal(payload.p_red_cards, 1)
      if (participation === null) {
        assert.equal(payload.p_has_played, false)
        for (const field of ['p_minutes_played', 'p_goals', 'p_assists']) assert.equal(payload[field], 0)
      }
      expectRedirect(harness.calls, '/dashboard')
    }
  }
})

test('direct reds remain independent and invalid disciplinary inputs are never hidden by normalization', async () => {
  for (const yellow of ['0', '1']) {
    const harness = actions()
    await assert.rejects(harness.addMatch(EMPTY_FORM_STATE, matchData({ yellow_cards: yellow, red_cards: '1' })), /REDIRECT/)
    assert.equal(harness.calls.rpc[0].payload.p_red_cards, 1)
    assert.equal(harness.calls.rpc[0].payload.p_yellow_cards, Number(yellow))
  }
  for (const values of [{ yellow_cards: '3', red_cards: '1' }, { yellow_cards: '2', red_cards: '2' }, { yellow_cards: '2.5', red_cards: '0' }]) {
    const harness = actions()
    expectError(await harness.updateMatch(EMPTY_FORM_STATE, matchData(values)), harness.calls)
    assert.equal(harness.calls.rpc.length, 0)
  }
})

test('blank historical values block editing before RPC instead of becoming zero or false', async () => {
  for (const field of ['team_score', 'opponent_score', 'minutes_played', 'goals', 'assists', 'yellow_cards', 'red_cards', 'has_played', 'is_motm']) {
    for (const participation of ['true', null]) {
      const harness = actions()
      expectError(await harness.updateMatch(EMPTY_FORM_STATE, matchData({ has_played: participation, [field]: '' })), harness.calls)
      assert.equal(harness.calls.rpc.length, 0, `${field}: ${participation}`)
    }
  }
  const knownZero = actions()
  await assert.rejects(knownZero.updateMatch(EMPTY_FORM_STATE, matchData({ goals: '0', assists: '0', minutes_played: '0', yellow_cards: '0', red_cards: '0' })), /REDIRECT/)
  assert.equal(knownZero.calls.rpc[0].payload.p_goals, 0)
})

test('editing sends its own match ID to the same RPC and redirects only on a matching result', async () => {
  const harness = actions()
  await assert.rejects(harness.updateMatch(EMPTY_FORM_STATE, matchData()), { message: 'REDIRECT:/dashboard' })
  assert.equal(harness.calls.rpc[0].payload.p_match_id, matchId)
  assert.equal('p_player_id' in harness.calls.rpc[0].payload, false)
  expectRedirect(harness.calls, '/dashboard')
  const mismatch = actions({ rpcData: otherMatchId })
  expectError(await mismatch.updateMatch(EMPTY_FORM_STATE, matchData()), mismatch.calls)
})

test('deletion distinguishes denied, missing and successfully deleted matches with an owner filter', async () => {
  for (const options of [{ dbError: { code: '42501', message: 'synthetic backend detail' } }, { row: null }]) {
    const harness = actions(options)
    expectError(await harness.deleteMatch(EMPTY_FORM_STATE, matchData()), harness.calls)
    assert.deepEqual(harness.calls.queries[0].filters, [
      { name: 'id', value: matchId }, { name: 'player_id', value: playerId },
    ])
  }
  const harness = actions()
  await assert.rejects(harness.deleteMatch(EMPTY_FORM_STATE, matchData()), { message: 'REDIRECT:/dashboard' })
  const query = harness.calls.queries[0]
  assert.equal(query.table, 'matches')
  assert.equal(query.operation, 'delete')
  assert.equal(query.select, 'id')
  assert.deepEqual(query.filters, [{ name: 'id', value: matchId }, { name: 'player_id', value: playerId }])
  assert.equal(harness.calls.queries.length, 1)
  expectRedirect(harness.calls, '/dashboard')
})

test('profile validation rejects invalid values before any database access', async () => {
  for (const changes of [{ display_name: 'x' }, { jersey_number: '1.5' }, { height: '99' },
    { weight: 'not-a-number' }, { preferred_position: 'invalid' }]) {
    const harness = actions()
    const state = await harness.updateProfile(EMPTY_FORM_STATE, profileData(changes))
    expectError(state, harness.calls)
    assert.ok(Object.keys(state.fieldErrors).length > 0)
    assert.equal(harness.calls.queries.length, 0)
  }
})

test('profile updates preserve optional nulls and RBFA URL/ID parsing, always targeting the current user', async () => {
  for (const [value, expected] of [['', null], ['368465', '368465'], ['https://www.rbfa.be/fr/team/368465', '368465']]) {
    const harness = actions()
    await assert.rejects(harness.updateProfile(EMPTY_FORM_STATE, profileData({
      display_name: '  Synthetic player  ', rbfa_team_id: value,
    })), { message: 'REDIRECT:/dashboard/settings?success=profile' })
    const query = harness.calls.queries[0]
    assert.equal(query.operation, 'update')
    assert.equal(query.table, 'profiles')
    assert.equal(query.payload.display_name, 'Synthetic player')
    assert.equal(query.payload.rbfa_team_id, expected)
    for (const field of ['club', 'category', 'preferred_position', 'foot_preference', 'jersey_number', 'height', 'weight']) {
      assert.equal(query.payload[field], null)
    }
    assert.deepEqual(query.filters, [{ name: 'id', value: playerId }])
    expectRedirect(harness.calls, '/dashboard/settings?success=profile')
  }
})

test('profile database failures and missing rows remain visible form errors', async () => {
  for (const options of [{ dbError: { code: '42501', message: 'synthetic backend detail' } }, { row: null }]) {
    const harness = actions(options)
    expectError(await harness.updateProfile(EMPTY_FORM_STATE, profileData()), harness.calls)
  }
})

test('avatar validation rejects missing, non-file, empty, oversized and unsupported uploads', async () => {
  for (const value of [null, 'not-a-file', new File([], 'empty.png', { type: 'image/png' }),
    new File(['x'], 'image.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(avatar.MAX_AVATAR_SIZE_BYTES + 1)], 'large.png', { type: 'image/png' })]) {
    const harness = actions()
    expectError(await harness.updateAvatar(EMPTY_FORM_STATE, avatarData(value)), harness.calls)
    assert.equal(harness.calls.uploads.length + harness.calls.queries.length, 0)
  }
})

test('avatar writes accept the 4 MiB boundary and reject one extra byte before Storage', async () => {
  for (const size of [avatar.MAX_AVATAR_SIZE_BYTES - 1, avatar.MAX_AVATAR_SIZE_BYTES]) {
    const harness = actions()
    await assert.rejects(harness.updateAvatar(EMPTY_FORM_STATE,
      avatarData(new File([new Uint8Array(size)], 'boundary.webp', { type: 'image/webp' }))),
    { message: 'REDIRECT:/dashboard/settings?success=avatar' })
    assert.equal(harness.calls.uploads.length, 1)
    assert.equal(harness.calls.uploads[0].file.size, size)
  }
  const harness = actions()
  const result = await harness.updateAvatar(EMPTY_FORM_STATE,
    avatarData(new File([new Uint8Array(avatar.MAX_AVATAR_SIZE_BYTES + 1)], 'oversized.png', { type: 'image/png' })))
  expectError(result, harness.calls)
  assert.match(result.message, /4 Mio/)
  assert.equal(harness.calls.uploads.length + harness.calls.queries.length, 0)
})

test('a failed avatar upload does not attempt to link a nonexistent image', async () => {
  const harness = actions({ uploadError: { message: 'synthetic backend detail' } })
  expectError(await harness.updateAvatar(EMPTY_FORM_STATE,
    avatarData(new File(['synthetic image'], 'image.png', { type: 'image/png' }))), harness.calls)
  assert.equal(harness.calls.uploads.length, 1)
  assert.equal(harness.calls.queries.length, 0)
})

test('avatar profile-link errors and missing rows do not redirect with a success message', async () => {
  for (const options of [{ dbError: { code: '42501', message: 'synthetic backend detail' } }, { row: null }]) {
    const harness = actions(options)
    expectError(await harness.updateAvatar(EMPTY_FORM_STATE,
      avatarData(new File(['synthetic image'], 'image.png', { type: 'image/png' }))), harness.calls)
    assert.equal(harness.calls.uploads.length, 1)
    assert.deepEqual(harness.calls.queries[0].filters, [{ name: 'id', value: playerId }])
  }
})

test('successful avatar writes use a generated owner path and MIME-derived extension', async () => {
  const harness = actions()
  await assert.rejects(harness.updateAvatar(EMPTY_FORM_STATE,
    avatarData(new File(['synthetic image'], 'untrusted.html', { type: 'image/png' }))),
  { message: 'REDIRECT:/dashboard/settings?success=avatar' })
  const path = `${playerId}/${fileId}.png`
  assert.equal(harness.calls.uploads[0].path, path)
  assert.equal(harness.calls.uploads[0].options.upsert, true)
  assert.equal(harness.calls.queries[0].payload.avatar_url, `https://storage.invalid/avatars/${path}`)
  expectRedirect(harness.calls, '/dashboard/settings?success=avatar')
})

function loadForm(state = EMPTY_FORM_STATE) {
  const dispatch = async () => undefined
  const formModule = loadModule('src/components/ActionForm.tsx', {
    react: { ...React, useActionState: () => [state, dispatch, false], useRef: () => ({ current: null }), useEffect() {} },
    '@/utils/formState': { EMPTY_FORM_STATE },
  })
  return { ...formModule, dispatch }
}

test('form feedback displays accessible field errors and success messages', () => {
  const { FormFeedback } = loadForm()
  assert.equal(renderToStaticMarkup(React.createElement(FormFeedback, { state: EMPTY_FORM_STATE })), '')
  const errorHtml = renderToStaticMarkup(React.createElement(FormFeedback, { state: {
    status: 'error', message: 'Synthetic validation error', fieldErrors: { goals: ['Synthetic field message'] },
  } }))
  assert.match(errorHtml, /role="alert"/)
  assert.match(errorHtml, /Synthetic validation error/)
  assert.match(errorHtml, /Synthetic field message/)
  const successHtml = renderToStaticMarkup(React.createElement(FormFeedback, {
    state: { status: 'success', message: 'Synthetic success' },
  }))
  assert.match(successHtml, /role="status"/)
})

test('ActionForm blocks automatic resets and preserves submit handlers and children after errors', () => {
  const { default: ActionForm, dispatch } = loadForm({ status: 'error', message: 'Synthetic error' })
  const onSubmit = () => undefined
  const child = React.createElement('input', { name: 'opponent', defaultValue: 'Synthetic retained value' })
  const tree = ActionForm({ action: async () => EMPTY_FORM_STATE, children: child, onSubmit, className: 'synthetic-class' })
  let prevented = false
  tree.props.onReset({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(tree.type, 'form')
  assert.equal(tree.props.action, dispatch)
  assert.equal(tree.props.onSubmit, onSubmit)
  assert.equal(tree.props.className, 'synthetic-class')
  assert.equal(tree.props.children[1], child)
  assert.equal(tree.props.children[0].props.state.status, 'error')
})

test('DeleteButton retains the explicit confirmation and correct hidden match identifier', () => {
  const actionForm = () => null
  const submitButton = () => null
  let confirmed = false
  const { default: DeleteButton } = loadModule('src/app/dashboard/edit-match/[id]/DeleteButton.tsx', {
    './actions': { deleteMatch: async () => EMPTY_FORM_STATE },
    '@/components/ActionForm': { __esModule: true, default: actionForm },
    '@/app/dashboard/components/SubmitButton': { __esModule: true, default: submitButton },
  }, { window: { confirm: () => confirmed } })
  const tree = DeleteButton({ matchId })
  assert.equal(tree.type, actionForm)
  assert.equal(tree.props.children[0].props.name, 'match_id')
  assert.equal(tree.props.children[0].props.value, matchId)
  let prevented = false
  const event = { preventDefault() { prevented = true } }
  tree.props.onSubmit(event)
  assert.equal(prevented, true)
  confirmed = true
  prevented = false
  tree.props.onSubmit(event)
  assert.equal(prevented, false)
})

function matchPage(options = {}) {
  const queries = []
  const component = render => ({ __esModule: true, default: render })
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: playerId } } }) },
    from(table) {
      const query = { table, filters: [] }
      queries.push(query)
      const builder = {
        select() { return builder },
        eq(name, value) { query.filters.push({ name, value }); return builder },
        async maybeSingle() {
          return table === 'matches'
            ? { data: options.missing ? null : { id: matchId }, error: options.matchError ?? null }
            : { data: null, error: options.statisticsError ?? null }
        },
      }
      return builder
    },
  }
  const { default: page } = loadModule('src/app/dashboard/edit-match/[id]/page.tsx', {
    '@/utils/supabase/server': { createClient: async () => client },
    'next/navigation': {
      redirect(path) { throw new Error(`REDIRECT:${path}`) },
      notFound() { throw new Error('NOT_FOUND') },
    },
    './actions': {},
    '@/app/dashboard/components/SubmitButton': component(() => null),
    './DeleteButton': component(() => null),
    'next/link': component(({ children }) => React.createElement('a', null, children)),
    '@/data/belgian_clubs.json': { __esModule: true, default: [] },
    '@/app/dashboard/components/MatchFields': component(() => null),
    '../../match-form': matchForm,
    '@/components/ActionForm': component(({ children }) => React.createElement('form', null, children)),
    '@/utils/readErrors': readErrors,
  })
  return { render: () => page({ params: Promise.resolve({ id: options.id ?? matchId }) }), queries }
}

test('match edit returns not-found only for malformed IDs or absent owned matches', async () => {
  const invalid = matchPage({ id: 'invalid' })
  await assert.rejects(invalid.render(), /NOT_FOUND/)
  assert.equal(invalid.queries.length, 0)
  const missing = matchPage({ missing: true })
  await assert.rejects(missing.render(), /NOT_FOUND/)
  for (const query of missing.queries) {
    assert.ok(query.filters.some(filter => filter.name === 'player_id' && filter.value === playerId))
  }
})

test('match read failures remain technical errors instead of misleading not-found results', async t => {
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  const fixture = matchPage({ matchError: { code: '42501', message: 'synthetic backend detail' } })
  await assert.rejects(fixture.render(), error => {
    assert.match(error.message, /Impossible de charger/)
    assert.doesNotMatch(error.message, /NOT_FOUND|synthetic backend detail|42501/)
    return true
  })
  assert.equal(logs.length, 1)
})

test('missing match statistics preserve the explicit unavailable state and deletion route', async () => {
  const tree = await matchPage().render()
  const html = renderToStaticMarkup(tree)
  assert.match(html, /statistiques de ce match sont absentes/)
  assert.doesNotMatch(html, /NOT_FOUND|name="match_date"/)
})

test('page error feedback stays generic and retry invokes the Next refetch callback', () => {
  let retries = 0
  const { default: ErrorPage } = loadModule('src/app/error.tsx')
  const tree = ErrorPage({ unstable_retry: () => retries++, error: new Error('synthetic backend detail') })
  const html = renderToStaticMarkup(tree)
  assert.match(html, /role="alert"|Impossible de charger cette page/)
  assert.doesNotMatch(html, /synthetic backend detail/)
  const button = tree.props.children.find(child => child.type === 'button')
  button.props.onClick()
  assert.equal(retries, 1)
})
