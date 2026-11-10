import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as zod from 'zod'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import { renderServerPage } from './helpers/render-server-page.mjs'
import * as competitions from '../src/utils/competitionFilters.ts'
import * as playerStats from '../src/utils/playerStats.ts'
import { seasonPresentation } from '../src/utils/seasonPresentation.ts'

const owner = '10000000-0000-4000-8000-000000000001'
const navigation = loadUiModule('src/utils/seasonNavigation.ts', { './competitionFilters': competitions })
const current = navigation.seasonFromYear(2026)
const records = loadUiModule('src/utils/personalRecords.ts', { './seasonNavigation': navigation, './competitionFilters': competitions })
const review = loadUiModule('src/utils/seasonReview.ts', {
  './playerStats': playerStats, './seasonPresentation': { seasonPresentation }, './seasonNavigation': navigation, './personalRecords': records,
})
const model = loadUiModule('src/utils/seasonGoals.ts')
const validation = loadUiModule('src/app/dashboard/goals/goal-form.ts', { zod, '@/utils/seasonGoals': model })
const plain = value => JSON.parse(JSON.stringify(value))
const component = value => ({ __esModule: true, default: value })
const link = component(({ children, ...props }) => React.createElement('a', props, children))
const actions = { createSeasonGoal: async () => {}, updateSeasonGoal: async () => {}, deleteSeasonGoal: async () => {} }
const actionForm = ({ children, className }) => React.createElement('form', { className }, children)
const submitButton = ({ defaultLabel }) => React.createElement('button', { type: 'submit' }, defaultLabel)
const Form = loadUiModule('src/app/dashboard/goals/GoalForm.tsx', {
  '@/components/ActionForm': component(actionForm), '../components/SubmitButton': component(submitButton),
  '@/utils/seasonGoals': model, './actions': actions, './goal-form': validation,
}).default
const Delete = loadUiModule('src/app/dashboard/goals/DeleteGoalButton.tsx', {
  '@/components/ActionForm': component(actionForm), '../components/SubmitButton': component(submitButton), './actions': actions,
}).default
const Card = loadUiModule('src/app/dashboard/goals/GoalCard.tsx', {
  '@/utils/seasonGoals': model, './GoalForm': component(Form), './DeleteGoalButton': component(Delete),
}).default
const row = (id, values = {}, match = {}) => ({
  has_played: true, minutes_played: 60, goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC', ...values,
  matches: { id, match_date: '2026-09-01', opponent: 'Équipe fictive', competition_type: 'LEAGUE', team_score: 2, opponent_score: 1, ...match },
})
const goal = (metric = 'goals', values = {}) => ({
  id: `20000000-0000-4000-8000-${String(model.GOAL_METRICS.indexOf(metric) + 1).padStart(12, '0')}`,
  player_id: owner, season_start: 2026, metric, target: 15, created_at: '2026-10-01T00:00:00Z', ...values,
})

function selectorModule(params = new URLSearchParams()) {
  const pushes = []
  const Selector = loadUiModule('src/components/SeasonSelector.tsx', {
    '@/utils/seasonNavigation': navigation,
    'next/navigation': { useRouter: () => ({ push: (...args) => pushes.push(args) }), useSearchParams: () => params },
  }, { URLSearchParams }).default
  return { Selector, pushes }
}

async function page(options = {}) {
  const rows = options.rows ?? [], calls = options.calls ?? [], selectors = []
  const client = { auth: { getUser: async () => {
    calls.push({ kind: 'auth' })
    return { data: { user: options.anonymous ? null : { id: owner } }, error: options.authError ?? null }
  } } }
  const { Selector } = selectorModule(new URLSearchParams(options.params ?? {}))
  const Page = loadUiModule('src/app/dashboard/goals/page.tsx', {
    'next/link': link,
    'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`) }, notFound() { throw new Error('UNEXPECTED_404') } },
    '@/utils/navigation': loadUiModule('src/utils/navigation.ts', { './competitionFilters': competitions }, { URLSearchParams }),
    '../components/PerformanceNavigation': component(() => null),
    '@/utils/supabase/server': { createClient: async () => client },
    '@/utils/playerStats': { getCurrentSeason: () => current },
    '@/utils/seasonNavigation': navigation, '@/utils/seasonReview': review,
    '@/utils/competitionFilters': competitions, '@/utils/seasonGoals': model,
    '@/utils/loadSeasonContext': { loadSeasonContext: async (receivedClient, id) => {
      assert.equal(receivedClient, client); calls.push({ kind: 'context', owner: id })
      if (options.contextError) throw new Error('Impossible de charger les saisons des matchs.')
      return { matches: options.matches ?? rows.map(row => row.matches), career: options.career ?? [] }
    } },
    '@/utils/loadSeasonGoals': { loadSeasonGoals: async (receivedClient, id) => {
      assert.equal(receivedClient, client); calls.push({ kind: 'goals', owner: id })
      if (options.goalsError) throw new Error('Impossible de charger tes objectifs.')
      return options.goals ?? []
    } },
    '@/utils/loadSeasonReviewStats': { loadSeasonReviewStats: async (receivedClient, id, season) => {
      assert.equal(receivedClient, client); calls.push({ kind: 'statistics', owner: id, season })
      if (options.statsError) throw new Error('Impossible de charger le bilan de ta saison.')
      return rows.filter(row => row.matches.match_date >= season.startDate && row.matches.match_date < season.endDate)
    } },
    '@/components/SeasonSelector': component(props => { selectors.push(props); return React.createElement(Selector, props) }),
    './GoalCard': component(Card), './GoalForm': component(Form),
  }).default
  const tree = await Page({ searchParams: Promise.resolve(options.params ?? {}) })
  return { html: renderToStaticMarkup(tree), calls, selectors }
}

function elements(tree) {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)]
}

test('goals page authenticates before any private read and rejects auth errors instead of treating them as missing data', async t => {
  const calls = []
  await assert.rejects(page({ anonymous: true, calls }), /REDIRECT:\/login/)
  assert.deepEqual(calls, [{ kind: 'auth' }])
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  const failed = []
  await assert.rejects(page({ calls: failed, authError: { code: 'SYNTHETIC_AUTH', message: 'PRIVATE_DETAIL' } }), /Impossible de vérifier ta connexion/)
  assert.deepEqual(failed, [{ kind: 'auth' }])
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_DETAIL/)
})

test('all private data reads use the authenticated owner, with no foreign owner from the URL', async () => {
  const result = await page({ goals: [goal()], rows: [row('a')], params: { player_id: 'forged-owner', userId: 'forged-owner' } })
  assert.equal(result.calls[0].kind, 'auth')
  assert.equal(result.calls.length, 4)
  for (const call of result.calls.slice(1)) assert.equal(call.owner, owner)
  assert.match(result.html, /OBJECTIFS PRIVÉS/)
  assert.match(result.html, /Visible uniquement par toi/)
})

test('an inherited competition filter never changes an all-competition target or leaks into dashboard links', async () => {
  const result = await page({
    goals: [goal('goals', { target: 10 })],
    rows: [row('league', { goals: 2 }), row('cup', { goals: 3 }, { competition_type: 'CUP' }), row('friendly', { goals: 4 }, { competition_type: 'FRIENDLY' })],
    params: { comps: ['LEAGUE', 'CUP'], season: '2026-2027' },
  })
  assert.match(result.html, /data-goal-value="">9<\/strong>/)
  assert.match(result.html, /TOUTES COMPÉTITIONS/)
  assert.match(result.html, /href="\/dashboard\?season=2026-2027"/)
  assert.doesNotMatch(result.html, /href="[^\"]*comps=/)
})

test('goal-only seasons remain selectable before and after deleting their last recorded match', async () => {
  const historical = goal('goals', { season_start: 1985 })
  const withMatch = await page({ goals: [historical], rows: [row('old', { goals: 4 }, { match_date: '1985-09-01' })], params: { season: '1985-1986' } })
  assert.equal(withMatch.selectors[0].selected.startYear, 1985)
  assert.match(withMatch.html, /data-goal-value="">4<\/strong>/)
  const withoutMatch = await page({ goals: [historical], params: { season: '1985-1986' } })
  assert.equal(withoutMatch.selectors[0].selected.startYear, 1985)
  assert.deepEqual(plain(withoutMatch.selectors[0].seasons.map(season => season.startYear)), [2026, 1985])
  assert.match(withoutMatch.html, /Aucun match saisi pour calculer la progression/)
  assert.match(withoutMatch.html, /data-goal-value="">—<\/strong>/)
  assert.doesNotMatch(withoutMatch.html, /Saison indisponible|data-goal-value="">0<\/strong>/)
  assert.match(withoutMatch.html, /href="\/dashboard"/)
})

test('private goal seasons and targets never enter E1 dashboards or public profile season catalogues', async () => {
  for (const route of ['src/app/dashboard/page.tsx', 'src/app/profile/[userId]/page.tsx']) {
    const result = await renderServerPage(route, { searchParams: { season: '1985-1986' } })
    assert.ok(result.queries.every(query => query.table !== 'season_goals'))
    const selector = result.widgets.find(widget => widget.name === 'SeasonSelector')
    assert.ok(selector)
    assert.deepEqual(plain(selector.props.seasons.map(season => season.startYear)), [2026])
    assert.equal(selector.props.selected.startYear, 2026)
    assert.doesNotMatch(result.html, /data-goal-id|data-progress-kind|CIBLE CONFIRMÉE/)
  }
})

test('goals selector supplies its scoped hint while every default selector keeps its existing E1 wording', async () => {
  const result = await page()
  assert.equal(result.selectors[0].hint, 'Objectifs propres à chaque saison.')
  assert.match(result.html, /Objectifs propres à chaque saison\./)
  const { Selector } = selectorModule()
  const html = renderToStaticMarkup(React.createElement(Selector, { seasons: [current], selected: current, currentYear: 2026 }))
  assert.match(html, /Changer de saison réaffiche toutes ses compétitions\./)
})

test('a demo query cannot activate fixtures or bypass the real page auth and reads', async () => {
  const result = await page({ params: { demo: 'full' } })
  assert.equal(result.calls[0].kind, 'auth')
  assert.match(result.html, /Définir mon premier objectif/)
  assert.doesNotMatch(result.html, /data-goal-id|DÉMONSTRATION|joueur fictif/)
  await assert.rejects(page({ anonymous: true, params: { demo: 'full' } }), /REDIRECT:\/login/)
})

test('context, goal and statistics read failures propagate as technical errors rather than false 404 or empty objectives', async () => {
  for (const options of [{ contextError: true }, { goalsError: true }, { statsError: true }]) {
    await assert.rejects(page(options), error => {
      assert.match(error.message, /Impossible de charger/)
      assert.doesNotMatch(error.message, /404|NOT_FOUND|UNEXPECTED/)
      return true
    })
  }
})

test('invalid, repeated or unavailable seasons safely fall back and display the existing explicit warning', async () => {
  for (const season of ['not-a-season', '1980-1981', ['2026-2027']]) {
    const result = await page({ params: { season } })
    assert.equal(result.selectors[0].selected.startYear, 2026)
    assert.match(result.html, /Saison indisponible : la saison actuelle est affichée/)
  }
})

test('goal cards distinguish exact zero, partial minimum, achieved, exceeded and indeterminate states accessibly', () => {
  const scenarios = [
    { rows: [row('zero', { goals: 0 })], target: 15, kind: 'exact', value: '0', text: /EN CHEMIN/, now: 0 },
    { rows: [row('partial', { goals: 4 }), row('missing', { goals: null })], target: 15, kind: 'minimum', value: '4', text: /Au moins/, now: 4 / 15 * 100 },
    { rows: [row('achieved', { goals: 15 })], target: 15, kind: 'exact', value: '15', text: /ATTEINT/, now: 100 },
    { rows: [row('exceeded', { goals: 18 })], target: 15, kind: 'exact', value: '18', text: /DÉPASSÉ/, now: 100 },
    { rows: [row('unknown', { goals: null })], target: 15, kind: 'unknown', value: '—', text: /Progression indéterminée/, now: undefined },
    { rows: [], target: 15, kind: 'empty', value: '—', text: /Aucun match saisi/, now: undefined },
  ]
  for (const scenario of scenarios) {
    const seasonReview = review.buildSeasonReview(scenario.rows, current, competitions.COMPETITIONS, current, owner)
    const progress = model.buildGoalProgression(seasonReview, 'goals', scenario.target)
    const tree = Card({ goal: goal('goals', { target: scenario.target }), metric: 'goals', progress, index: 0 })
    const html = renderToStaticMarkup(tree)
    assert.match(html, new RegExp(`data-progress-kind="${scenario.kind}"`))
    assert.match(html, new RegExp(`data-goal-value="">${scenario.value}</strong>`))
    assert.match(html, scenario.text)
    const bar = elements(tree).find(element => element.props?.role === 'progressbar')
    assert.equal(bar.props['aria-valuemin'], 0)
    assert.equal(bar.props['aria-valuemax'], 100)
    assert.equal(bar.props['aria-valuenow'], scenario.now)
    assert.equal(bar.props['aria-label'], 'Objectif : Buts')
    assert.ok(bar.props['aria-valuetext'])
    if (scenario.kind === 'minimum') assert.match(bar.props['aria-valuetext'], /Au moins 4/)
    if (scenario.value === '18') {
      assert.match(html, /120 %/)
      assert.match(bar.props['aria-valuetext'], /120 pour cent/)
    }
    if (scenario.now === undefined) assert.doesNotMatch(html, /aria-valuenow=/)
  }
})

test('confirmed partial evidence reaching a goal is labelled honestly without claiming an exact total', () => {
  const seasonReview = review.buildSeasonReview([row('known', { goals: 15 }), row('unknown', { goals: null })], current, competitions.COMPETITIONS, current, owner)
  const progress = model.buildGoalProgression(seasonReview, 'goals', 15)
  const html = renderToStaticMarkup(React.createElement(Card, { goal: goal(), metric: 'goals', progress, index: 0 }))
  assert.match(html, /CIBLE CONFIRMÉE/)
  assert.match(html, /Objectif atteint sur les données confirmées/)
  assert.match(html, /Le total reste incomplet/)
})

test('a rounded minimum percentage never overstates confirmed progress visually or in accessible text', () => {
  const seasonReview = review.buildSeasonReview([row('known', { goals: 1 }), row('unknown', { goals: null })], current, competitions.COMPETITIONS, current, owner)
  const progress = model.buildGoalProgression(seasonReview, 'goals', 6)
  const tree = Card({ goal: goal('goals', { target: 6 }), metric: 'goals', progress, index: 0 })
  const html = renderToStaticMarkup(tree)
  assert.match(html, /≥ 16,6 %/)
  const bar = elements(tree).find(element => element.props?.role === 'progressbar')
  assert.match(bar.props['aria-valuetext'], /Au moins 16,6 pour cent/)
  assert.doesNotMatch(html, /16,7/)
  assert.equal(bar.props['aria-valuenow'], 1 / 6 * 100)
})

test('create and update forms choose the correct action and never render an owner input or mutable metric/season during editing', () => {
  const create = Form({ seasonStart: 1985, metrics: ['goals', 'assists'] })
  assert.equal(create.props.action, actions.createSeasonGoal)
  assert.equal(create.props.variant, 'stade')
  const inputs = elements(create).filter(element => element.type === 'input')
  assert.equal(inputs.find(input => input.props.name === 'season_start').props.value, 1985)
  assert.ok(!inputs.some(input => input.props.name === 'player_id'))
  const target = inputs.find(input => input.props.name === 'target')
  assert.equal(target.props.min, '1')
  assert.equal(target.props.max, validation.MAX_GOAL_TARGET)
  assert.equal(target.props.step, '1')
  assert.equal(target.props.required, true)
  const createHtml = renderToStaticMarkup(create)
  assert.match(createHtml, /Passes décisives/)
  assert.match(createHtml, /Définir mon objectif/)
  const update = Form({ seasonStart: 2026, metrics: [], goal: goal() })
  assert.equal(update.props.action, actions.updateSeasonGoal)
  assert.deepEqual(elements(update).filter(element => element.type === 'input' && element.props.type === 'hidden').map(input => [input.props.name, input.props.value]), [['goal_id', goal().id]])
  assert.equal(elements(update).find(element => element.props?.name === 'target').props.defaultValue, 15)
  assert.doesNotMatch(renderToStaticMarkup(update), /name="(?:player_id|season_start|metric)"/)
})

test('deletion requires opening an explicit native confirmation before its owner-free form', () => {
  const tree = Delete({ goalId: goal().id, label: 'Buts' })
  assert.equal(tree.type, 'details')
  const form = elements(tree).find(element => element.type === actionForm)
  assert.equal(form.props.action, actions.deleteSeasonGoal)
  const html = renderToStaticMarkup(tree)
  assert.match(html, /<summary>Supprimer/)
  assert.match(html, /Supprimer cet objectif \? Tes matchs et statistiques seront conservés/)
  assert.match(html, /Confirmer la suppression/)
  assert.match(html, /name="goal_id"/)
  assert.doesNotMatch(html, /name="player_id"/)
})

test('dashboard entry carries only the selected season even if its own statistics are filtered', async () => {
  const result = await renderServerPage('src/app/dashboard/page.tsx', {
    statistics: [row('cup', {}, { match_date: '2025-09-01', competition_type: 'CUP' })],
    searchParams: { season: '2025-2026', comps: 'CUP' },
  })
  const scope = result.widgets.find(widget => widget.name === 'PerformanceNavigation').props.scope
  const links = loadUiModule('src/utils/navigation.ts', { './competitionFilters': competitions }, { URLSearchParams }).buildNavigationLinks(scope, owner)
  assert.equal(links.goals, '/dashboard/goals?season=2025-2026')
  assert.ok(!links.goals.includes('comps='))
})
