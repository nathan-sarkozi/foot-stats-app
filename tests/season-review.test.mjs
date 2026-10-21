import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import * as competitions from '../src/utils/competitionFilters.ts'
import * as playerStats from '../src/utils/playerStats.ts'

const navigation = loadUiModule('src/utils/seasonNavigation.ts', { './competitionFilters': competitions })
const presentation = loadUiModule('src/utils/seasonPresentation.ts')
const records = loadUiModule('src/utils/personalRecords.ts', { './seasonNavigation': navigation, './competitionFilters': competitions })
const { buildSeasonReview: build, compareSeasonReviews: compare } = loadUiModule('src/utils/seasonReview.ts', {
  './playerStats': playerStats, './seasonPresentation': presentation, './seasonNavigation': navigation, './personalRecords': records,
})
const season = navigation.seasonFromYear(2026)
const previous = navigation.seasonFromYear(2025)
const plain = value => JSON.parse(JSON.stringify(value))
const row = (id, date = '2026-09-01', values = {}, match = {}) => ({
  has_played: true, goals: 1, assists: 2, minutes_played: 60, is_motm: false,
  yellow_cards: 0, red_cards: 0, position_played: 'MC', ...values,
  matches: { id, match_date: date, opponent: `Fixture ${id}`, competition_type: 'LEAGUE', team_score: 2, opponent_score: 1, ...match },
})
const review = (rows, selected = season, comps = competitions.COMPETITIONS) => build(rows, selected, comps, season, 'synthetic-player')

test('review reuses audited totals and orders every timeline point chronologically without mutation', () => {
  const rows = [row('late', '2026-09-03', { goals: 2, assists: 0 }), row('first', '2026-09-01'), row('middle', '2026-09-02', { goals: 0, assists: 1 })]
  const snapshot = structuredClone(rows)
  const result = review(rows)
  assert.deepEqual(rows, snapshot)
  assert.deepEqual(plain(result.rows.map(row => row.matches.id)), ['first', 'middle', 'late'])
  assert.deepEqual(plain(result.metrics), { appearances: 3, goals: 3, assists: 3, contributions: 6, minutes: 180, motm: 0 })
  assert.deepEqual(plain(result.timeline.map(point => [point.cumGoals, point.cumAssists])), [[1, 2], [1, 3], [3, 3]])
  assert.deepEqual(plain(result.timeline.map(point => point.contributions)), [3, 1, 2])
  assert.equal(result.status, 'current')
})

test('July to June boundaries, competition filters and season status use the E1 convention', () => {
  const rows = [row('before', '2026-06-30'), row('start', '2026-07-01'), row('end', '2027-06-30'), row('next', '2027-07-01'), row('cup', '2026-10-01', {}, { competition_type: 'CUP' })]
  assert.deepEqual(plain(review(rows, season, ['LEAGUE']).rows.map(row => row.matches.id)), ['start', 'end'])
  assert.equal(review(rows, previous).status, 'finished')
  assert.equal(review(rows, navigation.seasonFromYear(2027)).status, 'future')
  assert.equal(review(rows, season, ['CUP']).metrics.appearances, 1)
  assert.equal(review(rows, season, []).rows.length, 0)
})

test('a real zero remains known; missing goals only mask the relevant totals and cumulative curve', () => {
  const result = review([row('a', '2026-09-01', { goals: 0, assists: 0 }), row('b', '2026-09-02', { goals: null, assists: 1 }), row('c', '2026-09-03', { goals: 3, assists: 0 })])
  assert.equal(result.metrics.goals, null)
  assert.equal(result.metrics.assists, 1)
  assert.equal(result.metrics.contributions, null)
  assert.equal(result.metrics.appearances, 3)
  assert.deepEqual(plain(result.timeline.map(point => point.cumGoals)), [0, null, null])
  assert.deepEqual(plain(result.timeline.map(point => point.cumAssists)), [0, 1, 1])
  assert.deepEqual(plain(result.timeline.map(point => point.contributions)), [0, null, 3])
  assert.equal(result.presentation.incomplete, true)
})

test('non-participants can receive cards but never create playing totals, MOTM or artificial appearances', () => {
  const result = review([row('a'), row('bench', '2026-09-02', { has_played: false, goals: 99, assists: 99, minutes_played: 120, yellow_cards: 2, red_cards: 1, is_motm: true }), row('b', '2026-09-03', { is_motm: true })])
  assert.deepEqual(plain(result.metrics), { appearances: 2, goals: 2, assists: 4, contributions: 6, minutes: 120, motm: 1 })
  assert.equal(result.summary.totalYellows, 2)
  assert.equal(result.summary.totalReds, 1)
  assert.deepEqual(plain(result.milestones.map(row => row.matches.id)), ['b'])
  assert.equal(result.timeline[1].participation, false)
  assert.equal(result.timeline[1].goals, null)
  assert.equal(result.timeline[1].contributions, null)
  assert.equal(result.timeline[1].cumGoals, 1)
  assert.equal(result.records.streaks.goals.value, 2)
})

test('missing statistics and unknown participation prevent invented totals, milestones and continuous streaks', () => {
  const rows = navigation.includeUnreportedMatches([row('a').matches, row('missing', '2026-09-02').matches, row('b', '2026-09-03').matches], [row('a'), row('b', '2026-09-03')])
  const result = review(rows)
  assert.ok(Object.values(result.metrics).every(value => value === null))
  assert.equal(result.timeline[1].participation, null)
  assert.equal(result.timeline[2].cumGoals, null)
  assert.equal(result.records.streaks.goals.value, 1)
  assert.equal(result.milestones.length, 0)
})

test('records are limited to the reviewed season and preserve every tie and verifiable MOTM', () => {
  const result = review([row('old', '2025-09-01', { goals: 20 }), row('b', '2026-09-03', { goals: 3, assists: 0, is_motm: true }), row('a', '2026-09-01', { goals: 3, assists: 0, is_motm: true }), row('stop', '2026-09-02', { goals: 0, assists: 0 })])
  assert.equal(result.records.onMatch.goals.value, 3)
  assert.deepEqual(plain(result.records.onMatch.goals.winners.map(row => row.id)), ['a', 'b'])
  assert.equal(result.records.streaks.goals.value, 1)
  assert.equal(result.records.streaks.goals.winners.length, 2)
  assert.deepEqual(plain(result.milestones.map(row => row.matches.id)), ['a', 'b'])
})

test('duplicate ids count once and invalid calendar dates never enter a review or its records', () => {
  const first = row('a')
  assert.equal(review([first, structuredClone(first)]).metrics.appearances, 1)
  assert.equal(review([first, row('a', '2026-09-01', { goals: 5 })]).metrics.goals, null)
  const result = review([row('bad-day', '2027-02-29'), row('bad-month', '2026-13-01'), row('timestamp', '2026-09-01T14:00:00Z'), first])
  assert.equal(result.rows.length, 1)
  assert.equal(result.records.matches.length, 1)
})

test('same-day ordering is deterministic for charts but never invents a verifiable record streak', () => {
  const rows = [row('z'), row('a')]
  const result = review(rows)
  assert.deepEqual(plain(result), plain(review([...rows].reverse())))
  assert.deepEqual(plain(result.timeline.map(point => point.id)), ['a', 'z'])
  assert.equal(result.records.streaks.goals.ambiguousDays, 1)
  assert.equal(result.records.streaks.goals.value, null)
})

test('empty, manual-only and entirely unknown seasons never manufacture zeros or a comparison', () => {
  const empty = review([])
  assert.ok(Object.values(empty.metrics).every(value => value === null))
  assert.equal(empty.timeline.length, 0)
  // Manual career data is deliberately outside this model; recorded matches are its only input.
  const manualOnly = review([], previous)
  const result = compare(empty, manualOnly)
  assert.ok(Object.values(result).every(value => value.selected === null && value.other === null && value.difference === null))
  const unknown = review([row('unknown', '2026-09-01', { has_played: null, goals: null, assists: null, minutes_played: null, is_motm: null })])
  assert.ok(Object.values(unknown.metrics).every(value => value === null))
})

test('comparisons describe exact recorded totals and ratios, independently of season completeness or duration', () => {
  const selected = review([row('a'), row('b', '2026-09-02')])
  const other = review([row('old', '2025-09-01', { goals: 0, assists: 1, minutes_played: 90, is_motm: true })], previous)
  const result = compare(selected, other)
  assert.deepEqual(plain(result.appearances), { selected: 2, other: 1, difference: 1 })
  assert.deepEqual(plain(result.contributions), { selected: 6, other: 1, difference: 5 })
  assert.deepEqual(plain(result.contributionsPerAppearance), { selected: 3, other: 1, difference: 2 })
  assert.deepEqual(plain(result.motm), { selected: 0, other: 1, difference: -1 })
  assert.equal(selected.status, 'current')
  assert.equal(other.status, 'finished')
})

test('unknown or zero participation prevents ratios without masking independently known comparisons', () => {
  const complete = review([row('a')])
  const partial = review([row('b', '2026-09-01', { goals: null, assists: 0 })])
  const result = compare(complete, partial)
  assert.equal(result.goals.difference, null)
  assert.equal(result.contributionsPerAppearance.other, null)
  assert.equal(result.contributionsPerAppearance.difference, null)
  assert.equal(result.assists.difference, 2)
  const bench = review([row('bench', '2026-09-01', { has_played: false })])
  assert.equal(bench.metrics.appearances, 0)
  assert.equal(bench.metrics.goals, 0)
  assert.equal(compare(complete, bench).contributionsPerAppearance.other, null)
  assert.equal(compare(complete, bench).goals.difference, 1)
})
