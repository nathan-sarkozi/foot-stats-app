import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import { renderServerPage } from './helpers/render-server-page.mjs'
import * as competitions from '../src/utils/competitionFilters.ts'
import { getCurrentSeason, summarizeSeasonStats } from '../src/utils/playerStats.ts'
import { seasonPresentation } from '../src/utils/seasonPresentation.ts'
import { loadSeasonContext } from '../src/utils/loadSeasonContext.ts'

const navigation = loadUiModule('src/utils/seasonNavigation.ts', { './competitionFilters': competitions })
const { seasonFromYear, selectSeason, seasonYearForDate, includeUnreportedMatches } = navigation
const current = seasonFromYear(2026)
const plain = value => JSON.parse(JSON.stringify(value))
const row = (id, date = '2026-10-01', comp = 'LEAGUE', values = {}) => ({
  has_played: true, minutes_played: 60, goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC',
  ...values, matches: { id, match_date: date, opponent: `Fixture ${id}`, competition_type: comp, team_score: 2, opponent_score: 1 },
})
const career = (year, values = {}) => ({ id: `career-${year}`, season_start: year, season_end: year + 1, club: 'Club fictif', category: 'U17', is_youth: true, is_free_agent: false, has_stats: false, matches_played: null, goals: null, assists: null, yellow_cards: null, red_cards: null, ...values })

test('options come only from current season, recorded matches and manual careers, including old and free-agent years', () => {
  const records = [row('a'), row('b', '2025-06-30'), row('c', '2025-07-01'), row('d', '2025-07-01')]
  const selection = selectSeason(records.map(r => r.matches), [career(1985), career(2023, { is_free_agent: true })], current)
  assert.deepEqual(plain(selection.seasons.map(s => s.startYear)), [2026, 2025, 2024, 2023, 1985])
  assert.equal(selection.season.startYear, 2026)
  assert.deepEqual(plain(selection.activeComps), ['LEAGUE'])
  assert.deepEqual(plain(selectSeason([], [], current).seasons), [plain(current)])
})

test('stable season keys and invalid/repeated/unavailable parameters safely select current season', () => {
  const entries = [career(2025)]
  assert.equal(selectSeason([], entries, current, '2025-2026').season.startYear, 2025)
  for (const value of ['', '2025', '2025-2027', '9999-10000', '1984-1985', ['2025-2026'], ['2025-2026', '2026-2027']]) {
    const selected = selectSeason([], entries, current, value)
    assert.equal(selected.season.startYear, 2026)
    assert.equal(selected.invalidSeason, true)
  }
})

test('June/July calendar dates and explicit timezones use the Belgian calendar, independently of server timezone', () => {
  assert.equal(seasonYearForDate('2026-06-30'), 2025)
  assert.equal(seasonYearForDate('2026-07-01'), 2026)
  assert.equal(seasonYearForDate('2026-06-30T22:00:00Z'), 2026)
  assert.equal(seasonYearForDate('2026-07-01T00:30:00+03:00'), 2025)
  assert.equal(seasonYearForDate('2026-07-01T00:00:00+02:00'), 2026)
  assert.equal(getCurrentSeason(new Date('2026-06-30T21:59:59Z')).startYear, 2025)
  assert.equal(getCurrentSeason(new Date('2026-06-30T22:00:00Z')).startYear, 2026)
  for (const value of ['not-a-date', '2026-02-30', '2026-13-01', '2026-07-01T00:00:00']) assert.equal(seasonYearForDate(value), null)
})

test('season competitions retain available selections or explicitly reset when all are unavailable', () => {
  const matches = [row('old', '2025-10-01', 'CUP'), row('a'), row('b', '2026-10-02', 'FRIENDLY')].map(r => r.matches)
  const selection = selectSeason(matches, [], current, '2026-2027', ['CUP', 'LEAGUE'])
  assert.deepEqual(plain(selection.availableComps), ['LEAGUE', 'FRIENDLY'])
  assert.deepEqual(plain(selection.activeComps), ['LEAGUE'])
  const reset = selectSeason(matches, [], current, '2025-2026', 'LEAGUE')
  assert.equal(reset.resetCompetitions, true)
  assert.deepEqual(plain(reset.activeComps), ['CUP'])
  assert.deepEqual(plain(selectSeason([], [career(2024)], current, '2024-2025').availableComps), [])
})

test('unknown aggregates and cumulative charts remain unknown, while explicit zero and bench sanctions stay known', () => {
  const rows = [row('first', '2026-08-01', 'LEAGUE', { goals: 0 }), row('unknown', '2026-08-02', 'LEAGUE', { goals: null }), row('later', '2026-08-03')]
  const p = seasonPresentation(summarizeSeasonStats(rows, current), 3)
  assert.equal(p.known.goals, false)
  assert.equal(p.known.assists, true)
  assert.deepEqual(p.chartData.map(r => r.goals), [0, null, null])
  assert.equal(p.incomplete, true)
  const bench = row('bench', undefined, undefined, { has_played: false, minutes_played: 0, goals: 0, yellow_cards: 2, red_cards: 1 })
  const summary = summarizeSeasonStats([bench], current)
  const known = seasonPresentation(summary, 1).known
  assert.equal(known.goals, true)
  assert.equal(known.discipline, true)
  assert.equal(summary.matchesPlayed, 0)
  assert.equal(summary.totalYellows, 2)
  assert.equal(summary.totalReds, 1)
  assert.ok(Object.values(seasonPresentation(summarizeSeasonStats([], current), 0).known).every(value => value === false))
})

test('a match without a statistics row is retained with unknown participation, never silently counted as zero', () => {
  const matches = [row('recorded').matches, row('no-stats').matches]
  const combined = includeUnreportedMatches(matches, [row('recorded')])
  assert.equal(combined.length, 2)
  assert.equal(combined[1].has_played, null)
  assert.equal(combined[1].goals, null)
  const p = seasonPresentation(summarizeSeasonStats(combined, current), 2)
  assert.equal(p.known.participation, false)
  assert.equal(p.known.goals, false)
})

test('native selector resets competition filters only, preserves other URL state and remains keyboard accessible', () => {
  const calls = []
  const Selector = loadUiModule('src/components/SeasonSelector.tsx', {
    '@/utils/seasonNavigation': navigation,
    react: { useId: () => 'season-select' },
    'next/navigation': { useRouter: () => ({ push: (...args) => calls.push(args) }), useSearchParams: () => new URLSearchParams('comps=CUP&comps=LEAGUE&tag=keep&season=2026-2027') },
  }, { URLSearchParams }).default
  const tree = Selector({ seasons: [current, seasonFromYear(1985)], selected: current, currentYear: 2026 })
  const html = renderToStaticMarkup(tree)
  assert.match(html, /label for="season-select"/)
  assert.match(html, /<select id="season-select"/)
  assert.match(html, /2026-2027 · En cours/)
  assert.match(html, /1985-1986/)
  tree.props.children[0].props.children[1].props.onChange({ target: { value: '1985-1986' } })
  const query = new URLSearchParams(calls[0][0])
  assert.equal(query.get('season'), '1985-1986')
  assert.equal(query.get('tag'), 'keep')
  assert.equal(query.has('comps'), false)
  assert.equal(calls[0][1].scroll, false)
})

for (const page of ['src/app/dashboard/page.tsx', 'src/app/profile/[userId]/page.tsx']) {
  test(`${page}: each selected season isolates totals, charts, history and RBFA visibility`, async () => {
    const rows = [row('June', '2026-06-30', 'CUP', { goals: 3 }), row('July', '2026-07-01', 'LEAGUE', { goals: 1 }), row('current', '2026-10-01', 'CUP', { goals: 2 })]
    for (const [key, expected, ids] of [['2025-2026', 3, ['June']], ['2026-2027', 3, ['July', 'current']]]) {
      const result = await renderServerPage(page, { statistics: rows, searchParams: { season: key }, profile: { display_name: 'Fixture', club: null, rbfa_team_id: '123' } })
      assert.equal(result.cards.find(card => card.title === 'Buts').value, expected)
      assert.equal(result.charts[0].length, ids.length)
      for (const id of ids) assert.ok(result.html.includes(`Fixture ${id}`))
      for (const id of ['June', 'July', 'current'].filter(id => !ids.includes(id))) assert.ok(!result.html.includes(`Fixture ${id}`))
      assert.equal(result.widgets.some(widget => widget.name === 'TeamWidget'), key === '2026-2027')
      const query = result.queries.find(query => query.table === 'statistics')
      assert.equal(query.filters[1].args[1], key.slice(0, 4) + '-07-01')
    }
  })

  test(`${page}: manual historical totals stay separate and unknown and free-agent seasons never fabricate playing totals`, async () => {
    for (const values of [{ has_stats: true, matches_played: 12, goals: 4, assists: 0 }, { has_stats: false, matches_played: 0, goals: 0 }, { is_free_agent: true }]) {
      const result = await renderServerPage(page, { careerEntries: [career(1985, values)], searchParams: { season: '1985-1986' } })
      assert.ok(result.cards.every(card => card.value === '—'))
      assert.match(result.html, /jamais ajoutées aux statistiques/)
      assert.match(result.html, /Cela ne signifie pas qu’aucun match n’a été joué/)
      assert.equal(result.widgets.some(widget => widget.name === 'TeamWidget'), false)
      assert.deepEqual(result.charts, [[]])
      if (values.has_stats === true) assert.match(result.html, /<dd>0<\/dd>/)
      else if (values.is_free_agent) assert.match(result.html, /Période sans club/)
      else assert.match(result.html, /Non communiquées/)
    }
  })

  test(`${page}: manual same-season entry cannot add or replace calculated match totals`, async () => {
    const result = await renderServerPage(page, { statistics: [row('a')], careerEntries: [career(2026, { has_stats: true, goals: 50, matches_played: 20 })] })
    assert.equal(result.cards.find(card => card.title === 'Buts').value, 1)
    assert.match(result.html, /<dd>50<\/dd>/)
  })

  test(`${page}: metadata failures are errors, never silently empty seasons`, async () => {
    await assert.rejects(renderServerPage(page, { matchesError: { code: 'MOCK_FAILURE' } }), /Impossible de charger les saisons des matchs/)
    await assert.rejects(renderServerPage(page, { careerError: { code: 'MOCK_FAILURE' } }), /Impossible de charger les saisons de carrière/)
  })
}

test('season metadata pagination remains owner-scoped and preserves rows beyond 1,000 matches', async () => {
  const queries = []
  const matches = Array.from({ length: 1001 }, (_, index) => row(String(index), index === 1000 ? '1985-08-01' : '2026-10-01').matches)
  const client = { from(table) {
    const query = { table }; queries.push(query)
    const builder = { select() { return builder }, eq(key, value) { query.owner = [key, value]; return builder }, order() { return builder }, range(start, end) { query.range = [start, end]; return Promise.resolve({ data: table === 'matches' ? matches.slice(start, end + 1) : [], error: null }) } }
    return builder
  } }
  const result = await loadSeasonContext(client, 'fixture-owner')
  assert.equal(result.matches.length, 1001)
  assert.equal(queries.filter(query => query.table === 'matches').length, 2)
  for (const query of queries) assert.deepEqual(query.owner, ['player_id', 'fixture-owner'])
})
