import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import * as matchForm from '../src/app/dashboard/match-form.ts'
import * as readErrors from '../src/utils/readErrors.ts'
import { EMPTY_FORM_STATE } from '../src/utils/formState.ts'

// Actual presentation code, synthetic fixtures and explicit transports only.
// No .env, database connection, Auth request or real football data.
const component = value => ({ __esModule: true, default: value })
const matchId = '20000000-0000-4000-8000-000000000001'
const playerId = '10000000-0000-4000-8000-000000000001'
const match = { id: matchId, match_date: '1996-06-30', opponent: 'Synthetic historical opponent', competition_type: 'CUP', team_score: 0, opponent_score: 1 }
const stat = { has_played: true, minutes_played: 60, position_played: 'MC', goals: 0, assists: 1, is_motm: false, yellow_cards: 1, red_cards: 0 }
const Discipline = loadUiModule('src/app/dashboard/components/DisciplineFields.tsx').default
const Fields = loadUiModule('src/app/dashboard/components/MatchFields.tsx', {
  '@/data/belgian_clubs.json': component([{ matricule: '111', nom: 'Synthetic club' }]),
  './DisciplineFields': component(Discipline),
}).default

function disciplineHarness(props = {}) {
  const state = []
  let index = 0
  const UI = loadUiModule('src/app/dashboard/components/DisciplineFields.tsx', {
    react: { ...React, useState(initial) {
      const key = index++
      if (!(key in state)) state[key] = initial
      return [state[key], value => { state[key] = value }]
    } },
  }).default
  return { render() { index = 0; return UI(props) } }
}

function fieldTree(props) {
  const tree = Fields(props)
  const discipline = elements(tree, Discipline)[0]
  return React.createElement(React.Fragment, null, tree, disciplineHarness(discipline.props).render())
}

function elements(node, type) {
  if (!node || typeof node !== 'object') return []
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => elements(child, type))]
}
function controls(props) {
  const tree = fieldTree(props)
  return new Map([...elements(tree, 'input'), ...elements(tree, 'select')].map(node => [node.props.name, { ...node.props, defaultValue: node.props.value ?? node.props.defaultValue }]))
}

test('creation retains every field, default and numeric constraint', () => {
  const inputs = controls({})
  assert.deepEqual([...inputs.keys()].sort(), ['match_date', 'opponent', 'competition_type', 'team_score', 'opponent_score', 'has_played', 'minutes_played', 'position_played', 'goals', 'assists', 'is_motm', 'yellow_cards', 'red_cards'].sort())
  for (const [name, expected] of Object.entries({ team_score: '0', opponent_score: '0', minutes_played: '90', goals: 0, assists: 0, yellow_cards: '0', red_cards: '0', competition_type: 'LEAGUE', position_played: '' })) assert.equal(inputs.get(name).defaultValue, expected, name)
  assert.equal(inputs.get('has_played').defaultChecked, true)
  assert.equal(inputs.get('is_motm').defaultChecked, false)
  for (const name of ['match_date', 'opponent', 'competition_type', 'team_score', 'opponent_score']) assert.equal(inputs.get(name).required, true, name)
  for (const name of ['team_score', 'opponent_score', 'minutes_played', 'goals', 'assists', 'yellow_cards', 'red_cards']) assert.equal(inputs.get(name).min, '0', name)
  assert.equal(inputs.get('minutes_played').max, '120')
  assert.equal(inputs.get('yellow_cards').max, '2')
  assert.equal(inputs.get('red_cards').max, '1')
  assert.equal(inputs.get('opponent').list, 'belgian-clubs')
})

test('editing retains historical dates, each stored value, true flags and known zeroes', () => {
  const inputs = controls({ match, stat: { ...stat, is_motm: true } })
  for (const [name, value] of Object.entries({ ...match, ...stat })) {
    if (name === 'id' || typeof value === 'boolean') continue
    assert.equal(String(inputs.get(name).defaultValue), String(value), name)
  }
  assert.equal(inputs.get('has_played').defaultChecked, true)
  assert.equal(inputs.get('is_motm').defaultChecked, true)
  for (const name of ['team_score', 'goals']) assert.equal(inputs.get(name)['aria-describedby'], undefined)
  assert.doesNotMatch(inputs.get('red_cards')['aria-describedby'], /red_cards-hint/)
  const html = renderToStaticMarkup(React.createElement(Fields, { match, stat }))
  assert.match(html, /value="1996-06-30"/)
  assert.match(html, /value="CUP" selected=""/)
  assert.match(html, /value="MC" selected=""/)
})

test('unknown historic values stay blank and cannot be silently saved as zero or false', () => {
  const unknown = Object.fromEntries(Object.keys(stat).map(name => [name, null]))
  const props = { match: { ...match, team_score: null, opponent_score: null }, stat: unknown }
  const inputs = controls(props)
  assert.equal(inputs.get('team_score').defaultValue, '')
  assert.equal(inputs.get('opponent_score').defaultValue, '')
  assert.equal(inputs.get('has_played').defaultValue, '')
  assert.equal(inputs.get('is_motm').defaultValue, '')
  assert.equal(inputs.get('has_played').required, true)
  assert.equal(inputs.get('is_motm').required, true)
  for (const name of ['minutes_played', 'goals', 'assists', 'yellow_cards', 'red_cards']) {
    assert.equal(inputs.get(name).defaultValue, '', name)
    assert.equal(inputs.get(name).required, true)
    assert.ok(inputs.get(name)['aria-describedby'].split(' ').includes(`${name}-hint`))
  }
  const html = renderToStaticMarkup(React.createElement(Fields, props))
  assert.match(html, /Score non renseigné/)
  assert.match(html, /Participation non renseignée à l’origine/)
  assert.match(html, /MOTM non renseigné à l’origine/)
  assert.equal(html.match(/Valeur historique non renseignée/g)?.length, 5)
  assert.match(html, /Complète-les explicitement/)
  const data = new FormData()
  for (const [name, input] of inputs) data.set(name, String(input.defaultValue ?? ''))
  assert.equal(matchForm.parseMatchFormData(data).success, false)
})

test('a non-participant keeps discipline and every field while parsing still neutralizes playing data', () => {
  const props = { match, stat: { ...stat, has_played: false, yellow_cards: 2, red_cards: 1 } }
  const inputs = controls(props)
  assert.equal(inputs.get('has_played').defaultChecked, false)
  assert.equal(inputs.get('yellow_cards').defaultValue, '2')
  assert.equal(inputs.get('red_cards').defaultValue, '1')
  for (const field of inputs.values()) assert.notEqual(field.disabled, true)
  const data = new FormData()
  for (const [name, input] of inputs) {
    if (input.type === 'checkbox') { if (input.defaultChecked) data.set(name, input.value) }
    else data.set(name, String(input.defaultValue ?? ''))
  }
  const result = matchForm.parseMatchFormData(data)
  assert.equal(result.success, true)
  assert.equal(result.data.has_played, false)
  assert.equal(result.data.yellow_cards, 2)
  assert.equal(result.data.red_cards, 1)
  for (const field of ['minutes_played', 'goals', 'assists']) assert.equal(result.data[field], 0)
  assert.equal(result.data.is_motm, false)
  assert.equal(result.data.position_played, null)
  assert.match(renderToStaticMarkup(React.createElement(Fields, props)), /Les cartons restent enregistrés/)
})

test('two yellows automatically display one red, and reducing yellows clears only the automatic contribution', () => {
  const harness = disciplineHarness()
  const fields = () => new Map(elements(harness.render(), 'input').map(node => [node.props.name, node.props]))
  fields().get('yellow_cards').onChange({ target: { value: '2' } })
  assert.equal(fields().get('red_cards').value, '1')
  assert.equal(fields().get('red_cards').readOnly, true)
  assert.match(renderToStaticMarkup(harness.render()), /Deux cartons jaunes entraînent une expulsion/)
  fields().get('yellow_cards').onChange({ target: { value: '1' } })
  assert.equal(fields().get('red_cards').value, '0')
  assert.equal(fields().get('red_cards').readOnly, false)
  fields().get('yellow_cards').onChange({ target: { value: '2' } })
  fields().get('yellow_cards').onChange({ target: { value: '0' } })
  assert.equal(fields().get('red_cards').value, '0')
})

test('a manual direct red and any stored red survive subsequent changes to yellows', () => {
  for (const initial of [{}, { initialYellowCards: 2, initialRedCards: 1 }]) {
    const harness = disciplineHarness(initial)
    const fields = () => new Map(elements(harness.render(), 'input').map(node => [node.props.name, node.props]))
    if (!initial.initialRedCards) fields().get('red_cards').onChange({ target: { value: '1' } })
    for (const yellow of ['2', '1', '0', '2', '0']) {
      fields().get('yellow_cards').onChange({ target: { value: yellow } })
      assert.equal(fields().get('red_cards').value, '1')
    }
    fields().get('red_cards').onChange({ target: { value: '0' } })
    assert.equal(fields().get('red_cards').value, '0', 'only an explicit manual edit removes the manual red')
  }
})

test('an unknown red stays unknown unless two explicit yellows establish an expulsion', () => {
  const harness = disciplineHarness({ initialYellowCards: null, initialRedCards: null })
  const fields = () => new Map(elements(harness.render(), 'input').map(node => [node.props.name, node.props]))
  assert.equal(fields().get('yellow_cards').value, '')
  assert.equal(fields().get('red_cards').value, '')
  fields().get('yellow_cards').onChange({ target: { value: '2' } })
  assert.equal(fields().get('red_cards').value, '1')
  fields().get('yellow_cards').onChange({ target: { value: '1' } })
  assert.equal(fields().get('red_cards').value, '', 'the original unknown is preserved without fabricating zero')
})

test('an unlisted historical position stays visible without changing server validation', () => {
  const html = renderToStaticMarkup(React.createElement(Fields, { match, stat: { ...stat, position_played: 'Ancien poste' } }))
  assert.match(html, /value="Ancien poste" selected="">Ancien poste · Poste enregistré/)
  const data = new FormData()
  for (const [name, value] of Object.entries({ ...match, ...stat, has_played: 'true', position_played: 'Ancien poste' })) data.set(name, String(value))
  assert.equal(matchForm.parseMatchFormData(data).success, false)
})

test('all fields have associated labels and every help reference resolves', () => {
  const tree = fieldTree({ match, stat: Object.fromEntries(Object.keys(stat).map(name => [name, null])) })
  const labels = new Set(elements(tree, 'label').map(node => node.props.htmlFor))
  const ids = new Set(['div', 'p', 'input', 'select'].flatMap(type => elements(tree, type).map(node => node.props.id)).filter(Boolean))
  for (const field of [...elements(tree, 'input'), ...elements(tree, 'select')]) {
    assert.ok(labels.has(field.props.id), field.props.name)
    for (const id of field.props['aria-describedby']?.split(' ') ?? []) assert.ok(ids.has(id), id)
  }
})

async function pageHarness({ edit = false, error = null, statistics = stat, user = { id: playerId } } = {}) {
  const forms = [], queries = []
  const addMatch = async () => EMPTY_FORM_STATE, updateMatch = async () => EMPTY_FORM_STATE, deleteMatch = async () => EMPTY_FORM_STATE
  function ActionForm({ action, variant, children, ...props }) { forms.push({ action, variant }); return React.createElement('form', props, children) }
  const Button = loadUiModule('src/app/dashboard/components/SubmitButton.tsx', {
    'react-dom': { useFormStatus: () => ({ pending: false }) }, '@/utils/cn': { cn: (...args) => args.filter(Boolean).join(' ') },
  }).default
  const Delete = loadUiModule('src/app/dashboard/edit-match/[id]/DeleteButton.tsx', {
    './actions': { deleteMatch }, '@/components/ActionForm': component(ActionForm), '@/app/dashboard/components/SubmitButton': component(Button),
  }, { window: { confirm: () => false } }).default
  const Page = loadUiModule(`src/app/dashboard/${edit ? 'edit-match/[id]' : 'add-match'}/page.tsx`, {
    './actions': { addMatch, updateMatch }, './DeleteButton': component(Delete),
    '@/app/dashboard/components/MatchFields': component(Fields), '@/components/ActionForm': component(ActionForm),
    '@/app/dashboard/components/SubmitButton': component(Button),
    'next/link': component(({ children, ...props }) => React.createElement('a', props, children)),
    '../../match-form': matchForm, '@/utils/readErrors': readErrors,
    'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`) }, notFound() { throw new Error('NOT_FOUND') } },
    '@/utils/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from(table) {
        const query = { table, filters: [] }; queries.push(query)
        const builder = { select() { return builder }, eq(...args) { query.filters.push(args); return builder }, maybeSingle: async () => ({ data: table === 'matches' ? match : statistics, error: table === 'statistics' ? error : null }) }
        return builder
      },
    }) },
  }).default
  const tree = await Page({ params: Promise.resolve({ id: matchId }) })
  return { html: renderToStaticMarkup(tree), forms, queries, addMatch, updateMatch, deleteMatch }
}

test('creation uses the unchanged action and preserves return navigation and submission labels', async () => {
  const result = await pageHarness()
  assert.equal(result.forms.length, 1)
  assert.equal(result.forms[0].action, result.addMatch)
  assert.equal(result.forms[0].variant, 'stade')
  assert.match(result.html, /Enregistrer le match/)
  assert.match(result.html, /href="\/dashboard"/)
  assert.doesNotMatch(result.html, /name="match_id"|Supprimer cette rencontre/)
})

test('editing retains both owner-scoped reads, update action, hidden identifier and separate deletion form', async () => {
  const result = await pageHarness({ edit: true })
  assert.equal(result.forms.length, 2)
  assert.equal(result.forms[0].action, result.updateMatch)
  assert.equal(result.forms[1].action, result.deleteMatch)
  for (const form of result.forms) assert.equal(form.variant, 'stade')
  assert.deepEqual(result.queries.map(query => query.table), ['matches', 'statistics'])
  for (const query of result.queries) assert.ok(query.filters.some(([column, value]) => column === 'player_id' && value === playerId))
  assert.equal(result.html.match(/name="match_id"/g)?.length, 2)
  assert.match(result.html, /Mettre à jour le match/)
  assert.match(result.html, /Supprimer le match/)
  assert.match(result.html, /seront supprimés définitivement/)
  assert.ok(result.html.indexOf('</form>') < result.html.lastIndexOf('<form'), 'deletion is outside the editing form')
})

test('unavailable statistics keep the explicit error and deletion without displaying an editable form', async () => {
  const result = await pageHarness({ edit: true, statistics: null })
  assert.match(result.html, /role="alert"/)
  assert.match(result.html, /statistiques de ce match sont absentes/)
  assert.doesNotMatch(result.html, /name="match_date"/)
  assert.equal(result.forms.length, 1)
  assert.equal(result.forms[0].action, result.deleteMatch)
})

test('an unauthenticated edit still redirects before data reads or form rendering', async () => {
  await assert.rejects(pageHarness({ edit: true, user: null }), /REDIRECT:\/login/)
})

test('Stade form errors are visible, preserve children and cancel automatic reset with default behavior intact', () => {
  const dispatch = async () => undefined
  const state = { status: 'error', message: 'Synthetic validation failure', fieldErrors: { goals: ['Synthetic goals error'] } }
  const Form = loadUiModule('src/components/ActionForm.tsx', {
    react: { ...React, useActionState: () => [state, dispatch], useRef: () => ({ current: null }), useEffect() {} }, '@/utils/formState': { EMPTY_FORM_STATE },
  }).default
  for (const variant of ['default', 'stade']) {
    const child = React.createElement('input', { name: 'opponent', defaultValue: 'Synthetic retained value' })
    const tree = Form({ action: dispatch, variant, children: child })
    let prevented = false
    tree.props.onReset({ preventDefault() { prevented = true } })
    assert.equal(prevented, true)
    assert.equal(tree.props.action, dispatch)
    assert.equal(tree.props.children[1], child)
    assert.equal(tree.props.variant, undefined, 'style variant must not leak to the form DOM')
    const html = renderToStaticMarkup(tree)
    assert.match(html, /role="alert"/)
    assert.match(html, /Synthetic validation failure/)
    assert.match(html, /Synthetic goals error/)
    assert.match(html, /value="Synthetic retained value"/)
    if (variant === 'stade') assert.match(html, /feedbackError/)
  }
})

test('Stade danger action retains pending and disabled behavior', () => {
  for (const pending of [false, true]) {
    const Button = loadUiModule('src/app/dashboard/components/SubmitButton.tsx', {
      'react-dom': { useFormStatus: () => ({ pending }) }, '@/utils/cn': { cn: (...args) => args.filter(Boolean).join(' ') },
    }).default
    const html = renderToStaticMarkup(React.createElement(Button, { variant: 'danger', appearance: 'stade', defaultLabel: 'Supprimer le match', loadingLabel: 'Suppression en cours...' }))
    assert.match(html, /dangerButton/)
    assert.equal(html.includes('disabled=""'), pending)
    assert.ok(html.includes(pending ? 'Suppression en cours...' : 'Supprimer le match'))
  }
})

test('failed Stade submissions focus their visible alert while default forms keep their focus behavior', () => {
  for (const variant of ['default', 'stade']) {
    let focused = false
    const effects = []
    const Form = loadUiModule('src/components/ActionForm.tsx', {
      react: { ...React, useActionState: () => [{ status: 'error', message: 'Synthetic failure' }, async () => undefined],
        useRef: () => ({ current: { querySelector: () => ({ focus: () => { focused = true } }) } }),
        useEffect: effect => effects.push(effect) },
      '@/utils/formState': { EMPTY_FORM_STATE },
    }).default
    const tree = Form({ variant, action: async () => EMPTY_FORM_STATE })
    effects[0]()
    assert.equal(focused, variant === 'stade')
    const html = renderToStaticMarkup(tree)
    assert.equal(html.includes('tabindex="-1"'), variant === 'stade')
  }
})
