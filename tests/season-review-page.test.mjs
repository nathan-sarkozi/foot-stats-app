import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import * as competitions from '../src/utils/competitionFilters.ts'
import * as playerStats from '../src/utils/playerStats.ts'
import { seasonPresentation } from '../src/utils/seasonPresentation.ts'

const owner = '10000000-0000-4000-8000-000000000001'
const navigation = loadUiModule('src/utils/seasonNavigation.ts', { './competitionFilters': competitions })
const current = navigation.seasonFromYear(2026)
const records = loadUiModule('src/utils/personalRecords.ts', { './seasonNavigation': navigation, './competitionFilters': competitions })
const review = loadUiModule('src/utils/seasonReview.ts', {
  './playerStats': playerStats, './seasonPresentation': { seasonPresentation },
  './seasonNavigation': navigation, './personalRecords': records,
})
const component = value => ({ __esModule: true, default: value })
const link = component(({ children, ...props }) => React.createElement('a', props, children))
const CareerContext = loadUiModule('src/components/SeasonCareerContext.tsx', { 'next/link': link }).default
const plain = value => JSON.parse(JSON.stringify(value))
const row = (id, date = '2026-09-01', comp = 'LEAGUE', values = {}) => ({
  has_played: true, minutes_played: 60, goals: 1, assists: 0,
  yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC', ...values,
  matches: { id, match_date: date, opponent: `Rencontre fictive ${id}`, competition_type: comp, team_score: 2, opponent_score: 1 },
})
const career = (year, values = {}) => ({
  id: `career-${year}`, season_start: year, season_end: year + 1, club: 'Club fictif de carrière',
  category: 'U17', is_youth: true, is_free_agent: false, has_stats: false,
  matches_played: null, goals: null, assists: null, yellow_cards: null, red_cards: null, ...values,
})

async function page(options = {}) {
  const rows = options.rows ?? []
  const calls = options.calls ?? []
  const charts = [], selectors = [], filters = []
  const client = { auth: { getUser: async () => {
    calls.push({ kind: 'auth' })
    return { data: { user: options.anonymous ? null : { id: owner } } }
  } } }
  const Page = loadUiModule('src/app/dashboard/season-review/page.tsx', {
    'next/link': link,
    'next/navigation': {
      redirect(path) { throw new Error(`REDIRECT:${path}`) },
      notFound() { throw new Error('UNEXPECTED_404') },
    },
    '@/utils/navigation': loadUiModule('src/utils/navigation.ts', { './competitionFilters': competitions }, { URLSearchParams }),
    '../components/PerformanceNavigation': { __esModule: true, default: () => null },
    '@/utils/supabase/server': { createClient: async () => client },
    '@/utils/playerStats': { getCurrentSeason: () => current },
    '@/utils/seasonNavigation': navigation,
    '@/utils/seasonReview': review,
    '@/utils/loadSeasonContext': { loadSeasonContext: async (receivedClient, id) => {
      assert.equal(receivedClient, client)
      calls.push({ kind: 'metadata', owner: id })
      if (options.contextError) throw new Error('Impossible de charger les saisons des matchs.')
      return { matches: options.matches ?? rows.map(stat => stat.matches), career: options.career ?? [] }
    } },
    '@/utils/loadSeasonReviewStats': { loadSeasonReviewStats: async (receivedClient, id, season) => {
      assert.equal(receivedClient, client)
      calls.push({ kind: 'statistics', owner: id, season })
      if (options.statsErrorYear === season.startYear) throw new Error('Impossible de charger le bilan de ta saison. Réessaie dans quelques instants.')
      return rows.filter(stat => stat.matches.match_date >= season.startDate && stat.matches.match_date < season.endDate)
    } },
    '@/components/SeasonSelector': component(props => { selectors.push(props); return null }),
    '@/components/SeasonCareerContext': component(CareerContext),
    '../components/CompetitionFilter': component(props => { filters.push(props); return null }),
    './SeasonJourney': component(props => { charts.push(props.points); return React.createElement('div', { 'data-journey': true }) }),
  }).default
  const tree = await Page({ searchParams: Promise.resolve(options.params ?? {}) })
  return { html: renderToStaticMarkup(tree), calls, charts, selectors, filters }
}

const mainMetrics = html => Object.fromEntries([...html.matchAll(/<article\b[^>]*class="metric"[^>]*><h3>([^<]+)<\/h3><strong>([^<]*)<\/strong>/g)].map(match => [match[1], match[2]]))
function comparisonRows(html) {
  const table = html.match(/<table class="compareTable">([\s\S]*?)<\/table>/)?.[1] ?? ''
  return Object.fromEntries([...table.matchAll(/<tr><th scope="row">([^<]+)<\/th>([\s\S]*?)<\/tr>/g)]
    .map(match => [match[1], [...match[2].matchAll(/<td>([^<]*)<\/td>/g)].map(cell => cell[1])]))
}

test('season-review page redirects anonymous visitors before any metadata or statistics read', async () => {
  const calls = []
  await assert.rejects(page({ anonymous: true, calls }), /REDIRECT:\/login/)
  assert.deepEqual(calls, [{ kind: 'auth' }])
})

test('metadata, selected-season and comparison-season failures propagate as errors, never a false 404 or an empty review', async () => {
  await assert.rejects(page({ contextError: true }), /Impossible de charger les saisons des matchs/)
  const rows = [row('current'), row('previous', '2025-09-01')]
  for (const statsErrorYear of [2026, 2025]) {
    await assert.rejects(page({ rows, statsErrorYear }), /Impossible de charger le bilan de ta saison/)
  }
})

test('demo and foreign-owner URL parameters cannot select fixtures or change the authenticated read owner', async () => {
  const normal = await page({ rows: [row('normal')] })
  const injected = await page({ rows: [row('normal')], params: { demo: 'full', player_id: 'foreign-owner', user: 'foreign-owner' } })
  assert.equal(injected.html, normal.html)
  assert.ok(injected.calls.filter(call => call.kind !== 'auth').every(call => call.owner === owner))
  assert.doesNotMatch(injected.html, /Alex Terrain|x-footstats-demo|createRecordDemoData|createSeasonDemoData/)
})

test('selected season and comparison use exact July bounds and the same competition without fallback', async () => {
  const rows = [
    row('current-league', '2026-07-01', 'LEAGUE', { goals: 2 }),
    row('current-cup', '2026-09-01', 'CUP', { goals: 9 }),
    row('previous-league', '2026-06-30', 'LEAGUE', { goals: 1 }),
    row('previous-cup', '2025-09-01', 'CUP', { goals: 8 }),
  ]
  const result = await page({ rows, params: { season: '2026-2027', comps: 'LEAGUE', compare: '2025-2026' } })
  const reads = result.calls.filter(call => call.kind === 'statistics')
  assert.deepEqual(plain(reads.map(call => call.season)), plain([navigation.seasonFromYear(2026), navigation.seasonFromYear(2025)]))
  assert.deepEqual(plain(result.charts[0].map(point => point.id)), ['current-league'])
  assert.deepEqual(comparisonRows(result.html).Buts, ['2', '1', '+1'])
  assert.doesNotMatch(result.html, /Rencontre fictive current-cup|Rencontre fictive previous-cup/)
  assert.match(result.html, /href="\/dashboard\?season=2026-2027&amp;comps=LEAGUE"/)
  assert.match(result.html, /href="\/dashboard\/records\?comps=LEAGUE"/)
  assert.match(result.html, /name="comps" value="LEAGUE"/)

  const onlyOtherCup = await page({ rows: [rows[0], rows[3]], params: { comps: 'LEAGUE', compare: '2025-2026' } })
  assert.match(onlyOtherCup.html, /Aucun match saisi dans cette autre saison avec ces compétitions/)
  assert.equal(Object.keys(comparisonRows(onlyOtherCup.html)).length, 0)
  assert.doesNotMatch(onlyOtherCup.html, /Rencontre fictive previous-cup/)
})

test('records links keep the selected competitions even when they represent every competition available in that season', async () => {
  const result = await page({ rows: [row('league')], params: { comps: 'LEAGUE' } })
  assert.match(result.html, /href="\/dashboard\/records\?comps=LEAGUE"/)
  assert.deepEqual(plain(result.filters[0].selected), ['LEAGUE'])
})

test('manual-only historical seasons preserve known totals separately and never manufacture charts, records or comparisons', async () => {
  for (const entry of [
    career(1985, { has_stats: true, matches_played: 12, goals: 4, assists: 0 }),
    career(1985, { has_stats: null, club: null }),
    career(1985, { is_free_agent: true }),
  ]) {
    const result = await page({ career: [entry], params: { season: '1985-1986' } })
    assert.equal(result.selectors[0].selected.startYear, 1985)
    assert.match(result.html, /Saison renseignée dans ta carrière/)
    assert.match(result.html, /ne sont jamais ajoutées aux statistiques/)
    assert.match(result.html, /Les données manuelles de carrière ne créent ni courbe ni record/)
    assert.equal(result.charts.length, 0)
    assert.deepEqual(mainMetrics(result.html), {})
    assert.equal(Object.keys(comparisonRows(result.html)).length, 0)
    if (entry.has_stats === true) {
      assert.match(result.html, /<dt>Matchs<\/dt><dd>12<\/dd>/)
      assert.match(result.html, /<dt>Passes décisives<\/dt><dd>0<\/dd>/)
    } else if (entry.is_free_agent) assert.match(result.html, /Sans club|Période sans club/)
    else assert.match(result.html, /Club non renseigné|Non communiquées/)
  }
})

test('manual entries for a recorded season cannot replace or add to calculated match totals', async () => {
  const result = await page({ rows: [row('one', undefined, undefined, { goals: 2 })], career: [career(2026, { has_stats: true, goals: 99, matches_played: 40 })] })
  assert.equal(mainMetrics(result.html).Buts, '2')
  assert.match(result.html, /<dt>Buts<\/dt><dd>99<\/dd>/)
  assert.equal(result.charts[0].length, 1)
})

test('missing historical statistics stay unknown in totals, chronology and graph without requiring a current club', async () => {
  const known = row('known', '1985-09-01', 'LEAGUE', { goals: 0 })
  const missing = row('missing', '1985-09-02').matches
  const result = await page({ rows: [known], matches: [known.matches, missing], params: { season: '1985-1986' } })
  assert.deepEqual(mainMetrics(result.html), { Participations: '—', Buts: '—', 'Passes décisives': '—', 'Minutes jouées': '—' })
  assert.match(result.html, /SAISON TERMINÉE · MATCHS SAISIS/)
  assert.match(result.html, /Non communiquée/)
  assert.match(result.html, /totaux entièrement connus/)
  assert.deepEqual(plain(result.charts[0].map(point => point.contributions)), [0, null])
  assert.deepEqual(plain(result.charts[0].map(point => point.cumGoals)), [0, null])
  assert.match(result.html, /href="\/dashboard\/edit-match\/missing"/)
  assert.doesNotMatch(result.html, /NaN|Infinity|undefined/)
})

test('fully recorded review renders metrics, exact ratios, all ties, milestones and editable chronology', async () => {
  const rows = [
    row('first', '2026-09-01', 'LEAGUE', { goals: 2, assists: 1, is_motm: true }),
    row('second', '2026-09-02', 'LEAGUE', { goals: 2, assists: 1 }),
    row('previous', '2025-09-01', 'LEAGUE', { goals: 1, assists: 0 }),
  ]
  const result = await page({ rows })
  assert.deepEqual(mainMetrics(result.html), { Participations: '2', Buts: '4', 'Passes décisives': '2', 'Minutes jouées': '120' })
  assert.deepEqual(comparisonRows(result.html)['Contributions / participation'], ['3', '1', '+2'])
  assert.match(result.html, /2 rencontres ex æquo/)
  assert.match(result.html, /1 distinction Homme du Match confirmée/)
  assert.match(result.html, /href="\/dashboard\/edit-match\/first"/)
  assert.match(result.html, /href="\/dashboard\/edit-match\/second"/)
  assert.match(result.html, /Contributions décisives par rencontre/)
  assert.match(result.html, /VALEURS PAR MATCH · NON CUMULÉES/)
  assert.match(result.html, /BILAN PROVISOIRE/)
  assert.match(result.html, /sans conclusion automatique sur la progression/)
  assert.doesNotMatch(result.html, /NaN|Infinity|undefined/)
})

test('bench sanctions remain visible while appearances, playing statistics, graph points and denominator stay honest', async () => {
  const rows = [
    row('bench', '2026-09-01', 'LEAGUE', { has_played: false, minutes_played: 0, goals: 0, yellow_cards: 2, red_cards: 1 }),
    row('old', '2025-09-01'),
  ]
  const result = await page({ rows })
  assert.equal(mainMetrics(result.html).Participations, '0')
  assert.equal(mainMetrics(result.html).Buts, '0')
  assert.match(result.html, /<span>Cartons jaunes<\/span><strong>2<\/strong>/)
  assert.match(result.html, /<span>Expulsions<\/span><strong>1<\/strong>/)
  assert.match(result.html, /deux indicateurs ne sont pas additionnés/)
  assert.match(result.html, /Aucune participation confirmée/)
  assert.equal(result.charts[0][0].contributions, null)
  assert.equal(comparisonRows(result.html)['Contributions / participation'][0], '—')
  assert.equal(comparisonRows(result.html)['Contributions / participation'][2], '—')
})

test('invalid or repeated seasons and comparisons have explicit notices without inventing another selection', async () => {
  const rows = [row('current'), row('old', '2025-09-01')]
  for (const value of ['not-a-season', ['2025-2026', '2026-2027']]) {
    const result = await page({ rows, params: { season: value } })
    assert.equal(result.selectors[0].selected.startYear, 2026)
    assert.match(result.html, /Saison indisponible : la saison actuelle est affichée/)
  }
  for (const value of ['not-a-season', '2026-2027', ['2025-2026']]) {
    const result = await page({ rows, params: { compare: value } })
    assert.match(result.html, /saison de comparaison est indisponible ou identique/)
    assert.equal(result.calls.filter(call => call.kind === 'statistics').length, 1)
    assert.equal(Object.keys(comparisonRows(result.html)).length, 0)
  }
})

test('historical comma-separated and repeated competition filters normalize once, and invalid scope resets explicitly', async () => {
  const rows = [row('league'), row('cup', '2026-09-02', 'CUP'), row('friendly', '2026-09-03', 'FRIENDLY')]
  for (const comps of ['LEAGUE,CUP', ['LEAGUE', 'CUP'], ['LEAGUE,CUP', 'CUP']]) {
    const result = await page({ rows, params: { comps } })
    assert.deepEqual(plain(result.filters[0].selected), ['LEAGUE', 'CUP'])
    assert.deepEqual(plain(result.charts[0].map(point => point.id)), ['league', 'cup'])
    assert.match(result.html, /href="\/dashboard\/records\?comps=LEAGUE,CUP"/)
  }
  const invalid = await page({ rows, params: { comps: ['UNKNOWN'] } })
  assert.match(invalid.html, /compétitions demandées ne sont pas disponibles/)
  assert.deepEqual(plain(invalid.filters[0].selected), ['LEAGUE', 'CUP', 'FRIENDLY'])
  assert.equal(invalid.charts[0].length, 3)
})
