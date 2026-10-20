import assert from 'node:assert/strict'
import { cssModuleMock } from './helpers/load-ui-module.mjs'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as playerStats from '../src/utils/playerStats.ts'

// Actual helper, actions and components, with synthetic fixtures and an explicit
// import allowlist. No .env, HTTP call, database or real user is involved.
const require = createRequire(import.meta.url)
const idle = { status: 'idle', message: '' }
const userId = '11111111-1111-4111-8111-111111111111'
const entryId = '22222222-2222-4222-8222-222222222222'
const databaseError = { code: 'XX000', message: 'Synthetic database failure' }

function loadModule(path, mocks = {}, logs = []) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText
  const fileModule = { exports: {} }
  const context = vm.createContext({
    module: fileModule, exports: fileModule.exports,
    console: { error: (...args) => logs.push(args) },
    require(name) {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.module.css')) return cssModuleMock
      if (['zod', 'react', 'react/jsx-runtime'].includes(name)) return require(name)
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  new vm.Script(compiled, { filename: path }).runInContext(context)
  return fileModule.exports
}

const helper = loadModule('src/app/dashboard/career/career-form.ts', { '@/utils/playerStats': playerStats })

function careerForm(overrides = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    season_start: '2025', club: 'Synthetic club', category: 'P3',
    has_stats: 'on', matches_played: '12', goals: '3', assists: '4',
    yellow_cards: '1', red_cards: '0', ...overrides,
  })) if (value !== null) data.set(key, value)
  return data
}

function actions({ user = { id: userId }, authError = null, results = [] } = {}) {
  const queries = [], logs = [], invalidations = []
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from(table) {
      const query = { table, filters: [], operation: 'read' }
      queries.push(query)
      const result = results[queries.length - 1] ?? { data: null, error: null }
      const builder = {
        select(columns) { query.columns = columns; return builder },
        match(filters) { query.filters.push(filters); return builder },
        eq(column, value) { query.filters.push({ [column]: value }); return builder },
        order() { return builder }, returns() { return builder },
        update(data) { query.operation = 'update'; query.data = data; return builder },
        insert(data) { query.operation = 'insert'; query.data = data; return builder },
        delete() { query.operation = 'delete'; return builder },
        maybeSingle() { return Promise.resolve(result) },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
      }
      return builder
    },
  }
  const navigation = {
    redirect(path) { throw new Error(`REDIRECT:${path}`) },
    notFound() { throw new Error('NOT_FOUND') },
  }
  const mocks = {
    '@/utils/supabase/server': { createClient: async () => client },
    './career-form': helper, '../../career-form': helper,
    'next/cache': { revalidatePath: (...args) => invalidations.push(args) },
    'next/navigation': navigation,
  }
  return {
    ...loadModule('src/app/dashboard/career/actions.ts', mocks, logs),
    queries, logs, invalidations, mocks,
  }
}

test('historical seasons remain selectable without duplicates at July boundaries', () => {
  const june = helper.getCareerSeasonYears(1985, new Date(2026, 5, 30))
  const july = helper.getCareerSeasonYears(1985, new Date(2026, 6, 1))
  assert.equal(june[0], 2025)
  assert.equal(july[0], 2026)
  assert.equal(july.at(-1), 1985)
  assert.equal(july.length, 31)
  assert.equal(helper.getCareerSeasonYears(2025, new Date(2026, 6, 1)).length, 30)
})

test('career validation rejects decimals, negatives, missing values and each numeric limit', () => {
  for (const [name, maximum] of Object.entries({ matches_played: 100, goals: 200, assists: 200, yellow_cards: 50, red_cards: 20 })) {
    for (const value of ['1.5', '-1', '', null, String(maximum + 1)]) {
      const parsed = helper.parseCareerFormData(careerForm({ [name]: value }))
      assert.equal(parsed.success, false, `${name}: ${value}`)
    }
    assert.equal(helper.parseCareerFormData(careerForm({ [name]: String(maximum) })).success, true)
  }
})

test('club is required except for free agents and text is trimmed and bounded', () => {
  for (const club of [null, '', '   ', 'a'.repeat(101)]) {
    assert.equal(helper.parseCareerFormData(careerForm({ club })).success, false)
  }
  const freeAgent = helper.parseCareerFormData(careerForm({ is_free_agent: 'on', club: null, category: null }))
  assert.equal(freeAgent.success, true)
  assert.equal(freeAgent.data.club, null)
  const trimmed = helper.parseCareerFormData(careerForm({ club: '  Synthetic club  ', category: '  P3  ' }))
  assert.equal(trimmed.data.club, 'Synthetic club')
  assert.equal(trimmed.data.category, 'P3')
  assert.equal(helper.parseCareerFormData(careerForm({ category: 'a'.repeat(51) })).success, false)
})

test('files, invalid checkbox values and malformed seasons are refused', () => {
  for (const field of ['season_start', 'club', 'category', 'goals', 'has_stats', 'is_free_agent', 'is_youth']) {
    assert.equal(helper.parseCareerFormData(careerForm({ [field]: new File(['synthetic'], 'fixture.txt') })).success, false, field)
  }
  for (const season of [null, '', '2025.5', '1985', '9999']) {
    assert.equal(helper.parseCareerFormData(careerForm({ season_start: season })).success, false)
  }
  assert.equal(helper.parseCareerFormData(careerForm({ has_stats: 'false' })).success, false)
})

test('unknown statistics remain neutral and cards do not require any participation', () => {
  const unknown = helper.parseCareerFormData(careerForm({ has_stats: null, goals: null }))
  assert.equal(unknown.success, true)
  assert.equal(unknown.data.matches_played, 0)
  assert.equal(unknown.data.goals, 0)
  const bench = helper.parseCareerFormData(careerForm({ matches_played: '0', goals: '0', assists: '0', yellow_cards: '1' }))
  assert.equal(bench.success, true)
  assert.equal(bench.data.matches_played, 0)
  assert.equal(bench.data.yellow_cards, 1)
})

test('goals and assists require a played match while discipline remains independent', () => {
  for (const field of ['goals', 'assists']) {
    const parsed = helper.parseCareerFormData(careerForm({ matches_played: '0', goals: '0', assists: '0', [field]: '1' }))
    assert.equal(parsed.success, false)
    assert.deepEqual(Array.from(parsed.error.flatten().fieldErrors[field]), ['Les buts et passes décisives doivent être nuls lorsqu’aucun match n’a été joué.'])
  }
})

test('unauthenticated save and delete never access a business table', async () => {
  for (const method of ['saveCareerEntry', 'deleteCareerEntry']) {
    const subject = actions({ user: null })
    assert.equal((await subject[method](idle, careerForm())).status, 'error')
    assert.equal(subject.queries.length, 0)
  }
})

test('an authentication error never permits a mutation even if a user object is present', async () => {
  for (const method of ['saveCareerEntry', 'deleteCareerEntry']) {
    const subject = actions({ authError: { message: 'Synthetic authentication failure' } })
    assert.equal((await subject[method](idle, careerForm({ entry_id: entryId }))).status, 'error')
    assert.equal(subject.queries.length, 0)
  }
})

test('invalid entry identifiers never read or mutate career rows', async () => {
  for (const method of ['saveCareerEntry', 'deleteCareerEntry']) {
    for (const id of ['invalid', '', new File(['fixture'], 'fixture.txt')]) {
      const subject = actions()
      assert.equal((await subject[method](idle, careerForm({ entry_id: id }))).status, 'error')
      assert.equal(subject.queries.length, 0)
    }
  }
})

test('creation validates before insert, uses the signed-in owner and invalidates only on success', async () => {
  const invalid = actions()
  const failed = await invalid.saveCareerEntry(idle, careerForm({ club: '  ' }))
  assert.equal(failed.status, 'error')
  assert.ok(failed.fieldErrors.club)
  assert.equal(invalid.queries.length, 0)
  const subject = actions()
  const result = await subject.saveCareerEntry(idle, careerForm({ player_id: 'forged-owner', season_end: '9999' }))
  assert.equal(result.status, 'success')
  assert.equal(subject.queries[0].operation, 'insert')
  assert.equal(subject.queries[0].data.player_id, userId)
  assert.equal(subject.queries[0].data.season_end, 2026)
  assert.equal(subject.invalidations.length, 1)
})

test('historical year preservation requires a matching owner-scoped row read on the server', async () => {
  const subject = actions({ results: [
    { data: { id: entryId, season_start: 1985 }, error: null },
    { data: { id: entryId }, error: null },
  ] })
  await assert.rejects(subject.saveCareerEntry(idle, careerForm({ entry_id: entryId, season_start: '1985' })), /REDIRECT:\/dashboard\/career/)
  assert.equal(subject.queries.length, 2)
  for (const query of subject.queries) {
    assert.equal(query.filters[0].id, entryId)
    assert.equal(query.filters[0].player_id, userId)
  }
  assert.equal(subject.queries[1].data.season_start, 1985)
  const forged = actions({ results: [{ data: { id: entryId, season_start: 2025 }, error: null }] })
  assert.equal((await forged.saveCareerEntry(idle, careerForm({ entry_id: entryId, season_start: '1985', original_season_start: '1985' }))).status, 'error')
  assert.equal(forged.queries.length, 1)
})

test('missing career rows never report a successful modification or deletion', async () => {
  const missing = actions()
  assert.equal((await missing.saveCareerEntry(idle, careerForm({ entry_id: entryId }))).status, 'error')
  assert.equal(missing.queries.length, 1)
  const disappeared = actions({ results: [{ data: { id: entryId, season_start: 2025 }, error: null }] })
  assert.equal((await disappeared.saveCareerEntry(idle, careerForm({ entry_id: entryId }))).status, 'error')
  assert.equal(disappeared.invalidations.length, 0)
  const deletion = actions()
  assert.equal((await deletion.deleteCareerEntry(idle, careerForm({ entry_id: entryId }))).status, 'error')
  assert.equal(deletion.invalidations.length, 0)
})

test('database failures return a safe message, retain technical logs and never invalidate', async () => {
  for (const method of ['saveCareerEntry', 'deleteCareerEntry']) {
    const subject = actions({ results: [{ data: null, error: databaseError }] })
    const result = await subject[method](idle, careerForm(method === 'deleteCareerEntry' ? { entry_id: entryId } : {}))
    assert.equal(result.status, 'error')
    assert.doesNotMatch(result.message, /Synthetic database failure|XX000/)
    assert.equal(subject.logs[0][1].code, 'XX000')
    assert.equal(subject.invalidations.length, 0)
  }
  const update = actions({ results: [
    { data: { id: entryId, season_start: 2025 }, error: null },
    { data: null, error: databaseError },
  ] })
  assert.equal((await update.saveCareerEntry(idle, careerForm({ entry_id: entryId }))).status, 'error')
  assert.equal(update.logs.length, 1)
})

test('successful deletion retains both ownership filters', async () => {
  const subject = actions({ results: [{ data: { id: entryId }, error: null }] })
  assert.equal((await subject.deleteCareerEntry(idle, careerForm({ entry_id: entryId }))).status, 'success')
  assert.equal(subject.queries[0].operation, 'delete')
  assert.equal(subject.queries[0].filters[0].id, entryId)
  assert.equal(subject.queries[0].filters[0].player_id, userId)
  assert.equal(subject.invalidations.length, 1)
})

function formComponent({ initialData = null, result = idle } = {}) {
  let invoke, tree, resetCalls = 0, preventedResets = 0
  const setters = []
  const fakeForm = { reset() {
    resetCalls++
    tree.props.onReset({ preventDefault: () => preventedResets++ })
  } }
  let references = 0
  const mockedReact = {
    ...React,
    useEffect() {},
    useState(initial) { return [initial, value => setters.push(value)] },
    useRef(initial) { return { current: references++ === 0 ? fakeForm : initial } },
    useActionState(action) { invoke = action; return [result, action, false] },
  }
  const component = loadModule('src/app/dashboard/career/components/CareerForm.tsx', {
    react: mockedReact,
    '../actions': { saveCareerEntry: async () => result },
    '../career-form': helper,
    '@/utils/formState': { EMPTY_FORM_STATE: idle },
    '@/components/ActionForm': { FormFeedback: () => null },
    '@/app/dashboard/components/SubmitButton': { __esModule: true, default: () => null },
    '@/data/belgian_clubs.json': { __esModule: true, default: [] },
  }).default
  tree = component({ initialData })
  return { tree, invoke, setters, resets: () => ({ resetCalls, preventedResets }) }
}

test('the actual editing form renders its historical season as the selected option', () => {
  const { tree } = formComponent({ initialData: { id: entryId, season_start: 1985, has_stats: true } })
  assert.match(renderToStaticMarkup(tree), /value="1985" selected="">1985 - 1986/)
})

test('career form labels the unchanged assists field as passes décisives', () => {
  const { tree } = formComponent({ initialData: { id: entryId, season_start: 1985, has_stats: true, assists: 4 } })
  const html = renderToStaticMarkup(tree)
  assert.match(html, /<label[^>]*for="assists"[^>]*>Passes décisives 👟<\/label>/)
  assert.match(html, /<input[^>]*id="assists"[^>]*name="assists"[^>]*value="4"/)
})

test('an unknown legacy statistics flag stays unchecked while new seasons default to known statistics', () => {
  for (const has_stats of [null, false]) {
    const { tree } = formComponent({ initialData: { id: entryId, season_start: 1985, has_stats } })
    const html = renderToStaticMarkup(tree)
    const checkbox = html.match(/<input[^>]*id="has_stats"[^>]*>/)?.[0]
    assert.ok(checkbox)
    assert.doesNotMatch(checkbox, /checked/)
    assert.match(html.match(/<input[^>]*id="matches_played"[^>]*>/)?.[0] ?? '', /disabled/)
  }
  const newSeason = renderToStaticMarkup(formComponent().tree)
  assert.match(newSeason.match(/<input[^>]*id="has_stats"[^>]*>/)?.[0] ?? '', /checked/)
})

test('failed actions cancel React automatic resets and preserve form and toggle values', async () => {
  const subject = formComponent({ result: { status: 'error', message: 'Synthetic failure' } })
  await subject.invoke(idle, careerForm())
  let cancelled = false
  subject.tree.props.onReset({ preventDefault() { cancelled = true } })
  assert.equal(cancelled, true)
  assert.equal(subject.resets().resetCalls, 0)
  assert.equal(subject.setters.length, 0)
})

test('only a successful creation resets the form and its toggles', async () => {
  const subject = formComponent({ result: { status: 'success', message: 'Synthetic success' } })
  await subject.invoke(idle, careerForm())
  assert.equal(subject.resets().resetCalls, 1)
  assert.equal(subject.resets().preventedResets, 0)
  assert.deepEqual(subject.setters, [false, true])
  let cancelled = false
  subject.tree.props.onReset({ preventDefault() { cancelled = true } })
  assert.equal(cancelled, true)
  const editing = formComponent({ initialData: { id: entryId }, result: { status: 'success', message: '' } })
  await editing.invoke(idle, careerForm())
  assert.equal(editing.resets().resetCalls, 0)
})

test('career edit distinguishes missing rows, database errors and malformed ids', async () => {
  for (const [id, result, expected] of [
    [entryId, { data: null, error: null }, /NOT_FOUND/],
    [entryId, { data: null, error: databaseError }, /Impossible de charger/],
    ['invalid', { data: null, error: null }, /NOT_FOUND/],
  ]) {
    const subject = actions({ results: [result] })
    const page = loadModule('src/app/dashboard/career/edit/[id]/page.tsx', {
      ...subject.mocks,
      '../../components/CareerForm': { __esModule: true, default: () => null },
      'next/link': { __esModule: true, default: () => null },
    }, subject.logs).default
    await assert.rejects(page({ params: Promise.resolve({ id }) }), expected)
    assert.equal(subject.queries.length, id === 'invalid' ? 0 : 1)
    if (result.error) assert.equal(subject.logs.length, 1)
  }
})

test('career management read failures do not render an empty career', async () => {
  const subject = actions({ results: [{ data: null, error: databaseError }] })
  const page = loadModule('src/app/dashboard/career/page.tsx', {
    ...subject.mocks,
    './components/CareerForm': { __esModule: true, default: () => null },
    './components/DeleteCareerButton': { __esModule: true, default: () => null },
    'next/link': { __esModule: true, default: () => null },
  }, subject.logs).default
  await assert.rejects(page(), /Impossible de charger les saisons/)
  assert.equal(subject.logs.length, 1)
})
