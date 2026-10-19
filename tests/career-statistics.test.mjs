import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderServerPage } from './helpers/render-server-page.mjs'

// Offline component tests: the actual page and statistics helper use only
// synthetic fixtures, with no .env, network calls or database connection.
// Run: node --test --test-isolation=none tests/career-statistics.test.mjs
const statistic = overrides => ({
  has_played: true, minutes_played: 80, goals: 0, assists: 2,
  yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC',
  matches: {
    id: 'synthetic-match', match_date: '2026-10-18',
    opponent: 'Synthetic opponent', team_score: 1, opponent_score: 0,
    competition_type: 'LEAGUE',
  },
  ...overrides,
})

const careerEntry = overrides => ({
  id: 'synthetic-career', season_start: 2025, season_end: 2026,
  is_free_agent: false, club: 'Synthetic previous club', category: 'P3',
  is_youth: false, is_verified: false, has_stats: true,
  matches_played: 10, goals: 11, assists: 12, yellow_cards: 1, red_cards: 0,
  ...overrides,
})

async function renderCareer({
  profile = { club: 'Synthetic current club', category: 'P3' },
  entries = [], statistics = [], profileError = null,
  careerError = null, statsError = null,
} = {}) {
  return renderServerPage('src/app/profile/[userId]/career/page.tsx', {
    profile: profile === null ? null : { id: 'test-player', display_name: 'Synthetic', rbfa_team_id: null, ...profile },
    careerEntries: entries,
    statistics,
    profileError,
    careerError,
    statisticsError: statsError,
  })
}

test('public career retains the current club without any participation', async () => {
  const { html } = await renderCareer()
  assert.match(html, /Carrière Senior/)
  assert.match(html, /Synthetic current club/)
  assert.match(html, /26\/27/)
  assert.match(html, />0<\/span>/)
  assert.doesNotMatch(html, /Pas de données historiques/)
})

test('public career counts discipline for a substitute who never played', async () => {
  const { html } = await renderCareer({
    statistics: [statistic({ has_played: false, minutes_played: 0, assists: 0, yellow_cards: 2, red_cards: 1 })],
  })
  assert.match(html, /Synthetic current club/)
  assert.match(html, />2<\/span>/)
  assert.match(html, />1<\/span>/)
  assert.doesNotMatch(html, /Pas de données historiques/)
})

test('public career restricts automatic totals to the current season', async () => {
  const inSeason = statistic({ goals: 3 })
  const older = statistic({ goals: 41, matches: { ...inSeason.matches, match_date: '2026-06-30' } })
  const nextSeason = statistic({ goals: 43, matches: { ...inSeason.matches, match_date: '2027-07-01' } })
  const { html, queries } = await renderCareer({ statistics: [older, inSeason, nextSeason] })
  const statsQuery = queries.find(query => query.table === 'statistics')
  assert.match(statsQuery.select, /matches!inner\(/)
  assert.deepEqual(statsQuery.filters, [
    { method: 'eq', args: ['player_id', 'test-player'] },
    { method: 'gte', args: ['matches.match_date', '2026-07-01'] },
    { method: 'lt', args: ['matches.match_date', '2027-07-01'] },
  ])
  assert.match(html, />3<\/span>/)
  assert.doesNotMatch(html, />41<\/span>|>43<\/span>/)
})

test('manual current-season career entries stay authoritative without duplication', async () => {
  const { html } = await renderCareer({
    entries: [careerEntry({ season_start: 2026, season_end: 2027 })],
    statistics: [statistic({ goals: 7 })],
  })
  assert.match(html, /Synthetic previous club/)
  assert.match(html, />11<\/span>/)
  assert.doesNotMatch(html, /Synthetic current club|>7<\/span>/)
  assert.equal(html.match(/26\/27/g)?.length, 1)
})

test('youth and free-agent career rows remain visible without participation', async () => {
  const youth = await renderCareer({ profile: { club: 'Synthetic youth club', category: 'U17' } })
  assert.match(youth.html, /Parcours Jeune/)
  assert.doesNotMatch(youth.html, /Carrière Senior/)
  const freeAgent = await renderCareer({ profile: { club: null, category: null } })
  assert.match(freeAgent.html, /Sans club/)
  assert.doesNotMatch(freeAgent.html, /Pas de données historiques/)
})

test('statistics failures show unavailable values instead of fabricated zero totals', async () => {
  const { html } = await renderCareer({
    entries: [careerEntry()], statsError: { message: 'Synthetic statistics error' },
  })
  assert.match(html, /role="alert"/)
  assert.match(html, /Impossible de charger les statistiques/)
  assert.match(html, /Non communiquées/)
  assert.match(html, /Synthetic previous club/)
  assert.match(html, />11<\/span>/)
})

test('missing profiles and failed career reads retain the not-found behavior', async () => {
  await assert.rejects(renderCareer({ profile: null }), /NOT_FOUND/)
  await assert.rejects(renderCareer({ careerError: { message: 'Synthetic career error' } }), /NOT_FOUND/)
})
