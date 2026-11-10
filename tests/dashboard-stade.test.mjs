import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderServerPage } from './helpers/render-server-page.mjs'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import { getCurrentSeason, summarizeSeasonStats } from '../src/utils/playerStats.ts'

// Offline rendering of the real page/components. No .env, real accounts or HTTP.
const season = getCurrentSeason(new Date(2026, 9, 19))
const row = (id, stat = {}, match = {}) => ({
  has_played: true, minutes_played: 60, goals: 1, assists: 2,
  yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC', ...stat,
  matches: { id, match_date: '2026-10-19', opponent: `Fixture ${id}`, team_score: 2, opponent_score: 1, competition_type: 'LEAGUE', ...match },
})
const component = value => ({ __esModule: true, default: value })
const nextMocks = {
  'next/link': component(({ children, ...props }) => React.createElement('a', props, children)),
  'next/image': component(() => null),
  '@/utils/getClubLogo': { getClubLogo: () => null },
}

function matchMarkup(stat, featured = false) {
  const MatchSummary = loadUiModule('src/app/dashboard/components/MatchSummary.tsx', nextMocks).default
  return renderToStaticMarkup(React.createElement(MatchSummary, { stat, featured }))
}

test('all eight existing metrics and subtitles match the unchanged season summary', async () => {
  const rows = [row('a'), row('b', { goals: 0, assists: 1, is_motm: true }), row('bench', { has_played: false, yellow_cards: 1 })]
  const totals = summarizeSeasonStats(rows, season)
  const { cards, charts, queries } = await renderServerPage('src/app/dashboard/page.tsx', { statistics: rows })
  const expected = [
    ['Matchs joués', totals.matchesPlayed, `${totals.totalMinutes} min cumulées`],
    ['Buts + passes décisives', totals.totalGA, `${totals.totalGoals} ${totals.totalGoals === 1 ? 'but' : 'buts'} | ${totals.totalAssists} ${totals.totalAssists === 1 ? 'passe décisive' : 'passes décisives'}`],
    ['Buts', totals.totalGoals, totals.goalSubtitle],
    ['Passes décisives', totals.totalAssists, `${totals.assistsPerMatch} par match`],
    ['Victoires', `${totals.winRate}%`, `${totals.totalWins} V en ${totals.matchesPlayed} M`],
    ['Homme du Match', totals.totalMotm, ''],
    ['Poste le plus joué', totals.favPosition, `${totals.maxPosCount} apparitions`],
    ['Discipline', totals.totalYellows + totals.totalReds, `${totals.totalYellows} 🟨 | ${totals.totalReds} 🟥`],
  ]
  for (const [title, value, subtitle] of expected) assert.deepEqual(cards.find(c => c.title === title), { title, value, subtitle })
  assert.equal(cards.length, 9, 'minutes are additionally promoted without removing any original metric')
  assert.deepEqual(charts[0], totals.chartData)
  assert.deepEqual(queries.map(q => q.table), ['profiles', 'matches', 'career_entries', 'statistics'], 'season options load owner-scoped matches and manual career metadata')
})

test('long history remains complete and latest recorded match can be a non-participation', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => row(`history-${i}`, {}, { match_date: `2026-09-${String(i % 28 + 1).padStart(2, '0')}` }))
  rows.push(row('latest-bench', { has_played: false, yellow_cards: 1, red_cards: 1, minutes_played: 0, goals: 0, assists: 0 }, { match_date: '2026-10-20' }))
  const { html } = await renderServerPage('src/app/dashboard/page.tsx', { statistics: rows })
  assert.match(html, /Historique des matchs \(46\)/)
  for (const stat of rows) assert.ok(html.includes(`href="/dashboard/edit-match/${stat.matches.id}"`))
  const latest = html.indexOf('data-match-id="latest-bench"')
  assert.ok(latest > 0 && latest < html.indexOf('data-match-id="history-'), 'latest is featured before history')
  assert.match(html, /N’a pas joué/)
  assert.match(html, /🟨<\/span> 1/)
  assert.match(html, /🟥<\/span> 1/)
  assert.match(html, /href="\/dashboard\/add-match"/)
})

test('unknown individual fields and score stay unknown while known zeroes stay visible', () => {
  const html = matchMarkup(row('unknown', { minutes_played: null, goals: 0, assists: null, yellow_cards: 0, red_cards: null, position_played: null, is_motm: null }, { team_score: null }), true)
  assert.match(html, /Score incomplet/)
  assert.match(html, /score inconnu|équipe : inconnu/)
  assert.match(html, /<b>0<\/b> buts/)
  assert.match(html, /<b>—<\/b> passes décisives/)
  assert.match(html, /<b>—′<\/b> minutes/)
  assert.match(html, /MOTM : —/)
  assert.match(html, /🟨<\/span> 0/)
  assert.doesNotMatch(html, /data-outcome="win"/)
  const noAppearance = matchMarkup(row('bench', { has_played: false, minutes_played: 90, goals: 9, assists: 8, yellow_cards: 1 }))
  assert.match(noAppearance, /N’a pas joué/)
  assert.doesNotMatch(noAppearance, /<b>90′|<b>9<\/b> buts|<b>8<\/b> passes décisives/)
})

test('match summaries name assists explicitly with singular, plural, known zero and unknown values', () => {
  for (const featured of [false, true]) {
    for (const [assists, text] of [[0, '0 passes décisives'], [1, '1 passe décisive'], [2, '2 passes décisives'], [null, '— passes décisives']]) {
      const html = matchMarkup(row('wording', { assists }), featured)
      assert.ok(html.replace(/<[^>]*>/g, '').includes(text), text)
    }
  }
})

test('empty, missing identity and read failures have useful states instead of invented fixtures', async () => {
  const profile = { display_name: 'Fixture player', rbfa_team_id: null, club: null, category: null, preferred_position: null, jersey_number: null, avatar_url: null }
  const { html } = await renderServerPage('src/app/dashboard/page.tsx', { profile })
  assert.match(html, /Sans club renseigné/)
  assert.match(html, /Profil à compléter/)
  assert.match(html, /Aucun match enregistré dans FootStats/)
  assert.match(html, /SAISON 2026–27/)
  assert.doesNotMatch(html, /Alex Martin|Union des Prés|900|undefined|NaN/)
  const error = await renderServerPage('src/app/dashboard/page.tsx', { statisticsError: { code: 'FAILURE', message: 'Synthetic failure' } })
  assert.match(error.html, /role="alert"/)
  assert.match(error.html, /Impossible de charger les statistiques/)
  assert.doesNotMatch(error.html, /Historique des matchs/)
})

test('shared components keep their default public presentation when Stade is not requested', () => {
  for (const [path, props] of [
    ['StatCard', { title: 'Buts', value: 2, subtitle: '1 but / 60 min' }],
    ['FormGuide', { recentMatches: [{ team_score: 1, opponent_score: 0 }] }],
    ['StatsChart', { data: [] }],
  ]) {
    const UI = loadUiModule(`src/app/dashboard/components/${path}.tsx`).default
    const render = extra => renderToStaticMarkup(React.createElement(UI, { ...props, ...extra }))
    assert.equal(render({}), render({ variant: 'default' }))
    assert.doesNotMatch(render({}), /statHighlight|chartTable|formGuide/)
    assert.notEqual(render({}), render({ variant: 'stade' }))
  }
})

test('Stade chart exposes the exact cumulative values in a keyboard-accessible table', () => {
  const data = [{ date: '19 oct.', opponent: 'Fixture opponent', goals: 0, assists: 1 }]
  // Chart internals are irrelevant to this table check; no browser/ResizeObserver is used.
  const hidden = () => null
  const recharts = Object.fromEntries(['LineChart', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'ResponsiveContainer'].map(name => [name, hidden]))
  const Chart = loadUiModule('src/app/dashboard/components/StatsChart.tsx', { recharts }).default
  const html = renderToStaticMarkup(React.createElement(Chart, { data, variant: 'stade' }))
  assert.match(html, /<summary>Lire les données du graphique<\/summary>/)
  assert.match(html, /Fixture opponent/)
  assert.match(html, /Buts cumulés/)
  assert.match(html, /<caption>Cumul des buts et des passes décisives, dans l’ordre des rencontres<\/caption>/)
  assert.match(html, /<th scope="col">Passes décisives cumulées<\/th>/)
  assert.match(html, /<td>0<\/td><td>1<\/td>/)
})

test('chart legends and tooltips name cumulative assists in both presentations without changing series', () => {
  const data = [{ date: '19 oct.', opponent: 'Fixture opponent', goals: 0, assists: 1 }]
  for (const variant of ['default', 'stade']) {
    const lines = [], charts = []
    const passthrough = ({ children }) => children
    const recharts = Object.fromEntries(['XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend'].map(name => [name, () => null]))
    recharts.ResponsiveContainer = passthrough
    recharts.LineChart = function MockLineChart(props) { charts.push(props); return props.children }
    recharts.Line = function MockLine(props) { lines.push(props); return null }
    const Chart = loadUiModule('src/app/dashboard/components/StatsChart.tsx', { recharts }).default
    renderToStaticMarkup(React.createElement(Chart, { data, variant }))
    assert.equal(charts[0].data, data)
    assert.deepEqual(lines.map(({ dataKey, name }) => [dataKey, name]), [['goals', 'Buts cumulés'], ['assists', 'Passes décisives cumulées']])
  }
})

test('Stade recent form distinguishes an unknown score from a known goalless draw', () => {
  const Form = loadUiModule('src/app/dashboard/components/FormGuide.tsx').default
  const html = renderToStaticMarkup(React.createElement(Form, { variant: 'stade', recentMatches: [{ team_score: null, opponent_score: 0 }, { team_score: 0, opponent_score: 0 }] }))
  assert.match(html, /data-result="—"/)
  assert.match(html, /Résultat non renseigné/)
  assert.match(html, /data-result="N"/)
})
