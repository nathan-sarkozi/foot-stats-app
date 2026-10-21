import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createSeasonDemoData, DEMO_PLAYER_ID } from './fixtures/season-demo.mjs'
import { createRecordDemoData } from './fixtures/record-demo.mjs'
import { createReviewDemoData } from './fixtures/review-demo.mjs'

const now = new Date('2026-10-21T10:00:00Z')
const currentMatches = data => data.matches.filter(match => match.match_date >= '2026-07-01' && match.match_date < '2027-07-01')
const statsFor = (data, matches) => matches.map(match => data.statistics.find(stat => stat.match_id === match.id))

test('review fixtures supply two distinct recorded seasons, verifiable ties, MOTM and bench sanctions', () => {
  const data = createReviewDemoData(2026, 'full', now)
  const matches = currentMatches(data)
  const stats = statsFor(data, matches)
  const previous = data.matches.filter(match => match.match_date >= '2025-07-01' && match.match_date < '2026-07-01')
  assert.equal(matches.length, 18)
  assert.equal(previous.length, 9)
  assert.equal(stats.filter(stat => stat.has_played === true).length, 17)
  assert.equal(stats.filter(stat => stat.goals === 3).length, 2)
  assert.equal(stats.filter(stat => stat.assists === 3).length, 2)
  assert.equal(stats.filter(stat => stat.goals + stat.assists === 5).length, 2)
  assert.equal(stats.filter(stat => stat.is_motm === true).length, 3)
  const bench = stats.find(stat => stat.has_played === false)
  assert.deepEqual([bench.minutes_played, bench.goals, bench.assists, bench.yellow_cards, bench.red_cards], [0, 0, 0, 2, 1])
  assert.ok(stats.reduce((sum, stat) => sum + stat.goals, 0) !== statsFor(data, previous).reduce((sum, stat) => sum + stat.goals, 0))
  assert.equal(new Set(data.matches.map(match => match.id)).size, data.matches.length)
  assert.ok(data.matches.every(match => match.player_id === DEMO_PLAYER_ID))
  assert.ok(data.statistics.every(stat => stat.player_id === DEMO_PLAYER_ID && data.matches.some(match => match.id === stat.match_id)))
})

test('review dates remain in their season and never fabricate a future recorded performance', () => {
  for (const instant of [now, new Date('2026-07-10T10:00:00Z'), new Date('2026-06-30T22:30:00Z')]) {
    const data = createReviewDemoData(2026, 'full', instant)
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
    const date = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-')
    assert.ok(currentMatches(data).every(match => match.match_date >= '2026-07-01' && match.match_date <= date))
  }
  assert.throws(() => createReviewDemoData(2026, 'full', new Date('2026-06-30T10:00:00Z')), /already have started/)
  const dates = currentMatches(createReviewDemoData(2026, 'full', now)).map(match => match.match_date)
  assert.deepEqual(dates, [...dates].sort())
  assert.equal(new Set(dates).size, 18)
})

test('manual histories, non-communicated totals, free agency and partial recorded seasons stay separate', () => {
  const data = createReviewDemoData(2026, 'full', now)
  const entry = start => data.career_entries.find(row => row.season_start === start)
  assert.equal(entry(2024).has_stats, true)
  assert.equal(entry(2024).matches_played, 28)
  assert.equal(entry(2023).has_stats, false)
  assert.equal(entry(2023).goals, 0, 'legacy stored zero remains unreported when has_stats is false')
  assert.equal(entry(2022).is_free_agent, true)
  assert.equal(entry(2022).club, null)
  assert.equal(entry(1985).is_youth, true)
  for (const start of [2024, 2023, 2022, 1985]) assert.ok(!data.matches.some(match => match.match_date >= `${start}-07-01` && match.match_date < `${start + 1}-07-01`))
  const partial = data.matches.filter(match => match.match_date.startsWith('2021-'))
  assert.equal(partial.length, 3)
  assert.ok(statsFor(data, partial).some(stat => stat.goals === null && stat.minutes_played === null))
})

test('short, unknown and empty review scenarios are real fixture states, not UI constants', () => {
  const empty = createReviewDemoData(2026, 'empty', now)
  assert.deepEqual(empty.matches, [])
  assert.deepEqual(empty.statistics, [])
  assert.equal(empty.career_entries.length, 4)
  const short = createReviewDemoData(2026, 'short', now)
  assert.equal(short.matches.length, 2)
  assert.deepEqual(short.statistics.map(stat => [stat.goals, stat.assists]), [[0, 0], [1, 1]])
  const unknown = createReviewDemoData(2026, 'unknown', now)
  assert.equal(unknown.matches.length, 3)
  assert.equal(unknown.statistics.length, 2)
  assert.equal(unknown.statistics[0].has_played, true)
  assert.equal(unknown.statistics[1].has_played, null)
  assert.ok(unknown.statistics.every(stat => stat.goals === null && stat.assists === null && stat.minutes_played === null))
})

test('E3 leaves the E1 and E2 fixture factories unchanged and returns fresh mutable copies', () => {
  const originalSeasons = createSeasonDemoData(2026)
  const originalRecords = createRecordDemoData(2026)
  const data = createReviewDemoData(2026, 'full', now)
  data.matches[0].match_date = '1900-01-01'
  data.statistics[0].goals = 999
  const nextSeasons = createSeasonDemoData(2026)
  nextSeasons.rbfa_cache[0].updated_at = originalSeasons.rbfa_cache[0].updated_at
  assert.deepEqual(nextSeasons, originalSeasons)
  const next = createRecordDemoData(2026)
  // The pre-existing base fixture uses a current cache timestamp; it is not a playing statistic.
  next.rbfa_cache[0].updated_at = originalRecords.rbfa_cache[0].updated_at
  assert.deepEqual(next, originalRecords)
  assert.notEqual(createReviewDemoData(2026, 'full', now).statistics[0].goals, 999)
})

test('the review runner refuses deployment environments before it can create a preview or start Next', () => {
  const script = fileURLToPath(new URL('../scripts/preview-seasons.mjs', import.meta.url))
  for (const extra of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
    const result = spawnSync(process.execPath, [script, '3016', 'review'], { encoding: 'utf8', env: { PATH: process.env.PATH, ...extra } })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Local development only/)
    assert.doesNotMatch(result.stdout, /Private preview|localhost/)
  }
})

test('fixture imports and scenario hooks are absent from real application sources', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url))
  const visit = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'design-preview') continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.(?:mjs|[jt]sx?)$/.test(entry.name)) assert.doesNotMatch(readFileSync(path, 'utf8'), /createReviewDemoData|review-demo\.mjs|x-footstats-demo-scenario|__FIXTURE_PATH__/, path)
    }
  }
  visit(root)
})
