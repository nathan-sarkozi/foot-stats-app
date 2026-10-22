import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import * as competitions from '../src/utils/competitionFilters.ts'
import * as playerStats from '../src/utils/playerStats.ts'
import { loadSeasonGoals, SEASON_GOALS_SELECT } from '../src/utils/loadSeasonGoals.ts'

const navigation = loadUiModule('src/utils/seasonNavigation.ts', { './competitionFilters': competitions })
const presentation = loadUiModule('src/utils/seasonPresentation.ts')
const records = loadUiModule('src/utils/personalRecords.ts', { './seasonNavigation': navigation, './competitionFilters': competitions })
const { buildSeasonReview } = loadUiModule('src/utils/seasonReview.ts', {
  './playerStats': playerStats, './seasonPresentation': presentation, './seasonNavigation': navigation, './personalRecords': records,
})
const { GOAL_METRICS, GOAL_LABELS, buildGoalProgression: progress } = loadUiModule('src/utils/seasonGoals.ts')
const season = navigation.seasonFromYear(2026)
const owner = '10000000-0000-4000-8000-000000000001'
const plain = value => JSON.parse(JSON.stringify(value))
const row = (id, values = {}, match = {}) => ({
  has_played: true, goals: 1, assists: 2, minutes_played: 60, is_motm: false,
  yellow_cards: 0, red_cards: 0, position_played: 'MC', ...values,
  matches: { id, match_date: '2026-09-01', opponent: 'Équipe fictive', competition_type: 'LEAGUE', team_score: 2, opponent_score: 1, ...match },
})
const review = rows => buildSeasonReview(rows, season, competitions.COMPETITIONS, season, owner)

test('four goal metrics are stable, explicit and do not include manual career or discipline totals', () => {
  assert.deepEqual(plain(GOAL_METRICS), ['goals', 'assists', 'appearances', 'motm'])
  assert.equal(GOAL_LABELS.assists.label, 'Passes décisives')
  assert.equal(GOAL_LABELS.assists.singular, 'Passe décisive')
})

test('an exact progression uses recorded E3 totals across every competition and ignores other seasons', () => {
  const result = review([row('league'), row('cup', {}, { competition_type: 'CUP' }), row('friendly', {}, { competition_type: 'FRIENDLY' }), row('old', { goals: 99 }, { match_date: '2025-09-01' })])
  assert.deepEqual(plain(progress(result, 'goals', 15)), {
    kind: 'exact', status: 'in-progress', value: 3, percentage: 20, barPercentage: 20, remaining: 12,
  })
  assert.equal(progress(result, 'assists', 10).value, 6)
  assert.equal(progress(result, 'appearances', 25).value, 3)
  assert.equal(progress(result, 'motm', 5).value, 0)
})

test('achieved and exceeded objectives expose true percentages while visually capping the bar', () => {
  const result = review([row('a', { goals: 18 })])
  assert.deepEqual(plain(progress(result, 'goals', 15)), {
    kind: 'exact', status: 'exceeded', value: 18, percentage: 120, barPercentage: 100, remaining: 0,
  })
  assert.equal(progress(result, 'goals', 18).status, 'achieved')
  assert.equal(progress(result, 'goals', 18).percentage, 100)
})

test('changing only a target changes the goal status without changing any statistics', () => {
  const result = review([row('a', { goals: 4 })])
  const before = plain(result)
  assert.equal(progress(result, 'goals', 3).status, 'exceeded')
  assert.equal(progress(result, 'goals', 4).status, 'achieved')
  assert.equal(progress(result, 'goals', 5).status, 'in-progress')
  assert.deepEqual(plain(result), before)
})

test('recorded real zero is exact while an entirely absent match season never becomes zero', () => {
  const zero = progress(review([row('zero', { goals: 0, assists: 0, is_motm: false })]), 'goals', 5)
  assert.equal(zero.kind, 'exact')
  assert.equal(zero.value, 0)
  assert.equal(zero.percentage, 0)
  const empty = progress(review([]), 'goals', 5)
  assert.deepEqual(plain(empty), { kind: 'empty', status: 'no-matches', value: null, percentage: null, barPercentage: 0, remaining: null })
  // No career input exists: historical manual totals cannot enter the calculation.
})

test('known non-participation and zero minutes never create artificial playing contributions', () => {
  const bench = review([row('bench', { has_played: false, goals: 99, assists: 99, is_motm: true, yellow_cards: 2, red_cards: 1 })])
  for (const metric of GOAL_METRICS) {
    assert.equal(progress(bench, metric, 5).value, 0)
    assert.equal(progress(bench, metric, 5).kind, 'exact')
  }
  const played = review([row('played', { has_played: true, minutes_played: 0 })])
  assert.equal(progress(played, 'appearances', 1).value, 1)
})

test('partial positive evidence is a minimum and is independent for every metric', () => {
  const result = review([row('known', { goals: 4, assists: 0, is_motm: true }), row('partial', { goals: null, assists: 1, is_motm: null })])
  assert.equal(progress(result, 'goals', 15).kind, 'minimum')
  assert.equal(progress(result, 'goals', 15).value, 4)
  assert.equal(progress(result, 'goals', 15).remaining, null)
  assert.equal(progress(result, 'assists', 10).kind, 'exact')
  assert.equal(progress(result, 'assists', 10).value, 1)
  assert.equal(progress(result, 'appearances', 25).kind, 'exact')
  assert.equal(progress(result, 'motm', 5).kind, 'minimum')
  assert.equal(progress(result, 'motm', 5).value, 1)
})

test('a confirmed lower bound can itself achieve or exceed an objective without claiming an exact total', () => {
  const result = review([row('known', { goals: 4 }), row('missing', { has_played: null, goals: null })])
  assert.equal(progress(result, 'goals', 4).status, 'achieved')
  assert.equal(progress(result, 'goals', 4).kind, 'minimum')
  assert.equal(progress(result, 'goals', 3).status, 'exceeded')
  assert.ok(progress(result, 'goals', 3).percentage > 100)
})

test('unknown participation cannot confirm supplied game values or create a zero percentage', () => {
  const result = review([row('unknown', { has_played: null, goals: 99, assists: 99, is_motm: true })])
  for (const metric of GOAL_METRICS) assert.deepEqual(plain(progress(result, metric, 5)), {
    kind: 'unknown', status: 'indeterminate', value: null, percentage: null, barPercentage: 0, remaining: null,
  })
  assert.equal(progress(review([row('zero', { goals: 0 }), row('missing', { goals: null })]), 'goals', 5).kind, 'unknown')
})

test('a missing statistics row and conflicting duplicate become unknown rather than a falsely complete total', () => {
  const known = row('known', { goals: 4 })
  const rows = navigation.includeUnreportedMatches([known.matches, row('missing').matches], [known])
  const result = progress(review(rows), 'goals', 15)
  assert.equal(result.kind, 'minimum')
  assert.equal(result.value, 4)
  assert.equal(progress(review([known, row('known', { goals: 5 })]), 'goals', 15).kind, 'unknown')
})

test('editing or deleting a match recomputes progression downwards with no persisted achievement', () => {
  assert.equal(progress(review([row('a', { goals: 5 }), row('b', { goals: 5 })]), 'goals', 10).status, 'achieved')
  assert.equal(progress(review([row('a', { goals: 5 }), row('b', { goals: 0 })]), 'goals', 10).value, 5)
  assert.equal(progress(review([row('a', { goals: 5 })]), 'goals', 10).value, 5)
  assert.equal(progress(review([]), 'goals', 10).status, 'no-matches')
})

test('invalid targets are rejected instead of producing infinite or negative progress', () => {
  for (const target of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => progress(review([]), 'goals', target), /entier strictement positif/)
  }
})

function goalsClient(rows, responses = {}) {
  const queries = []
  return { queries, client: { from(table) {
    const query = { table }; queries.push(query)
    const builder = {
      select(value) { query.select = value; return builder },
      eq(key, value) { query.owner = [key, value]; return builder },
      order(value) { query.order = value; return builder },
      range(start, end) {
        query.range = [start, end]
        return Promise.resolve(responses[start] ?? { data: rows.filter(row => row.player_id === query.owner[1]).slice(start, end + 1), error: null })
      },
    }
    return builder
  } } }
}

test('goal reader paginates every owner season, including goal-only seasons, and excludes foreign targets', async () => {
  const goals = Array.from({ length: 1001 }, (_, id) => ({ id: String(id), player_id: owner, season_start: 2026 - Math.floor(id / 4), metric: 'goals', target: 15, created_at: '2026-10-01T00:00:00Z' }))
  const fixture = goalsClient([...goals, { ...goals[0], id: 'foreign', player_id: 'other' }])
  const result = await loadSeasonGoals(fixture.client, owner)
  assert.deepEqual(result, goals)
  assert.deepEqual(fixture.queries, [0, 1000].map(offset => ({
    table: 'season_goals', select: SEASON_GOALS_SELECT, owner: ['player_id', owner], order: 'id', range: [offset, offset + 999],
  })))
})

test('goal reader preserves an empty result but refuses errors or missing response as false emptiness', async t => {
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  assert.deepEqual(await loadSeasonGoals(goalsClient([]).client, owner), [])
  for (const response of [{ data: null, error: { code: '42501', message: 'PRIVATE_DETAIL' } }, { data: null, error: null }]) {
    await assert.rejects(loadSeasonGoals(goalsClient([], { 0: response }).client, owner), /Impossible de charger tes objectifs/)
  }
  assert.deepEqual(logs.map(entry => entry[1]), [{ code: '42501' }, { code: 'NO_DATA' }])
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_DETAIL|10000000/)
})
