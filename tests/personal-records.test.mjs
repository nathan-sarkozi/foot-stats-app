import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import * as competitions from '../src/utils/competitionFilters.ts'
import { loadPersonalRecords, RECORDS_SELECT } from '../src/utils/loadPersonalRecords.ts'
import { createRecordDemoData } from './fixtures/record-demo.mjs'

const seasonNavigation = loadUiModule('src/utils/seasonNavigation.ts', { './competitionFilters': competitions })
const recordsModule = loadUiModule('src/utils/personalRecords.ts', { './seasonNavigation': seasonNavigation, './competitionFilters': competitions })
const { buildPersonalRecords: build } = recordsModule
const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const plain = value => JSON.parse(JSON.stringify(value))
const row = (id, day = 1, values = {}, match = {}) => ({ id, player_id: owner, match_date: `2026-09-${String(day).padStart(2, '0')}`, opponent: `Fixture ${id}`, competition_type: 'LEAGUE', ...match,
  statistics: { player_id: owner, has_played: true, goals: 1, assists: 0, is_motm: false, ...values } })

test('single-match maxima keep exact scores, contexts and every chronological tie', () => {
  const input = [row('later', 3, { goals: 3, assists: 1 }), row('first', 1, { goals: 3, assists: 0 }), row('assist', 2, { goals: 0, assists: 4 })]
  const result = build(input, owner)
  assert.equal(result.onMatch.goals.value, 3)
  assert.deepEqual(plain(result.onMatch.goals.winners.map(r => r.id)), ['first', 'later'])
  assert.equal(result.onMatch.assists.value, 4)
  assert.deepEqual(plain(result.onMatch.contributions.winners.map(r => r.id)), ['assist', 'later'])
  assert.deepEqual(input.map(r => r.id), ['later', 'first', 'assist'], 'input order is preserved')
})

test('unknown, invalid and explicit-zero statistics have different meanings', () => {
  const unknown = build([row('unknown', 1, { goals: null, assists: null })], owner)
  assert.equal(unknown.onMatch.goals.value, null)
  assert.equal(unknown.onMatch.goals.unknown, 1)
  assert.equal(unknown.streaks.goals.value, null)
  assert.equal(unknown.seasons.goals.value, null)
  const zero = build([row('zero', 1, { goals: 0, assists: 0 })], owner)
  assert.equal(zero.onMatch.goals.value, 0)
  assert.equal(zero.streaks.goals.value, 0)
  assert.equal(zero.seasons.goals.value, 0)
  assert.equal(zero.onMatch.goals.unknown, 0)
  for (const value of [-1, 0.5, NaN, Infinity]) assert.equal(build([row('invalid', 1, { goals: value })], owner).onMatch.goals.value, null)
})

test('contribution maximum needs both fields but a known positive field can prove a contribution streak', () => {
  const result = build([row('goal', 1, { goals: 1, assists: null }), row('assist', 2, { goals: null, assists: 1 })], owner)
  assert.equal(result.onMatch.contributions.value, null)
  assert.equal(result.streaks.contributions.value, 2)
  assert.equal(result.streaks.goals.value, 1)
})

test('known non-participations never add goals, assists, appearances or MOTM and do not break a playing streak', () => {
  const result = build([row('a'), row('bench', 2, { has_played: false, goals: 99, assists: 99, is_motm: true, yellow_cards: 2, red_cards: 1 }), row('b', 3)], owner)
  assert.equal(result.appearances, 2)
  assert.equal(result.onMatch.goals.value, 1)
  assert.equal(result.onMatch.assists.value, 0)
  assert.equal(result.streaks.goals.value, 2)
  assert.deepEqual(plain(result.streaks.goals.winners[0].matches.map(r => r.id)), ['a', 'b'])
  assert.equal(result.seasons.goals.value, 2)
  assert.equal(result.seasons.appearances.value, 2)
  assert.equal(result.seasons.motm.value, 0)
})

test('unknown participation, a missing statistics row and an unknown goal all prevent a false continuous streak', () => {
  for (const middle of [row('unknown', 2, { goals: null }), row('unknown', 2, { has_played: null }), { ...row('unknown', 2), statistics: null }]) {
    const result = build([row('a'), middle, row('c', 3)], owner)
    assert.equal(result.streaks.goals.value, 1)
    assert.equal(result.streaks.goals.unknown, 1)
    assert.equal(result.streaks.goals.winners.length, 2)
    assert.equal(result.seasons.goals.value, null)
  }
})

test('known zero ends a run; all equally longest maximal runs are retained', () => {
  const result = build([row('e', 5), row('a'), row('zero', 3, { goals: 0 }), row('b', 2), row('d', 4)], owner)
  assert.equal(result.streaks.goals.value, 2)
  assert.deepEqual(plain(result.streaks.goals.winners.map(run => run.matches.map(r => r.id))), [['a', 'b'], ['d', 'e']])
})

test('June/July splits seasons and streaks and never merges a manual season into recorded totals', () => {
  const input = [row('June', 1, {}, { match_date: '2026-06-30' }), row('July', 1, { assists: 2, is_motm: true }, { match_date: '2026-07-01' })]
  const result = build(input, owner)
  assert.equal(result.seasonCount, 2)
  assert.equal(result.streaks.goals.value, 1)
  assert.deepEqual(plain(result.seasons.goals.winners), [2025, 2026])
  assert.equal(result.seasons.assists.value, 2)
  assert.deepEqual(plain(result.seasons.assists.winners), [2026])
  assert.equal(result.seasons.motm.value, 1)
  // Arbitrary career-shaped fields are not inputs to any calculation.
  const contaminated = input.map(r => ({ ...r, career_entries: [{ goals: 9999, season_start: 2024 }] }))
  const withoutManualTotals = build(contaminated, owner)
  assert.deepEqual(plain(withoutManualTotals.seasons), plain(result.seasons))
  for (const metric of ['goals', 'assists', 'contributions']) assert.equal(withoutManualTotals.onMatch[metric].value, result.onMatch[metric].value)
  for (const metric of ['goals', 'contributions']) assert.equal(withoutManualTotals.streaks[metric].value, result.streaks[metric].value)
})

test('each season metric has its own completeness and compares only eligible seasons', () => {
  const result = build([
    row('partial', 1, { goals: null, assists: 4, is_motm: null }),
    row('complete', 1, { goals: 2, assists: 1, is_motm: false }, { match_date: '2025-09-01' }),
  ], owner)
  assert.equal(result.seasons.goals.value, 2)
  assert.equal(result.seasons.goals.unknown, 1)
  assert.equal(result.seasons.assists.value, 4)
  assert.equal(result.seasons.assists.unknown, 0)
  assert.equal(result.seasons.motm.value, 0)
  assert.equal(result.seasons.motm.unknown, 1)
  assert.deepEqual(plain(result.seasons.appearances.winners), [2025, 2026])
})

test('days with multiple relevant matches cannot impose an invented chronological order on streaks', () => {
  const input = [row('before'), row('day-a', 2), row('day-b', 2, { goals: 0 }), row('after', 3)]
  const a = build(input, owner), b = build([...input].reverse(), owner)
  assert.equal(a.streaks.goals.value, 1)
  assert.equal(a.streaks.goals.ambiguousDays, 1)
  assert.deepEqual(plain(a), plain(b))
  assert.equal(build([row('a'), row('bench', 1, { has_played: false })], owner).streaks.goals.value, 1)
})

test('duplicate matches count once and conflicting duplicate statistics become unknown', () => {
  const first = row('a')
  const result = build([first, structuredClone(first), row('b', 2)], owner)
  assert.equal(result.matches.length, 2)
  assert.equal(result.seasons.goals.value, 2)
  assert.equal(result.streaks.goals.value, 2)
  const conflict = build([first, row('a', 1, { goals: 5 })], owner)
  assert.equal(conflict.matches.length, 1)
  assert.equal(conflict.onMatch.goals.value, null)
})

test('foreign owners and foreign statistics cannot create a record or bridge a run', () => {
  const result = build([row('a'), row('foreign', 2, { player_id: other, goals: 99 }, { player_id: other }), row('mismatch', 3, { player_id: other, goals: 99 }), row('c', 4)], owner)
  assert.equal(result.matches.length, 3)
  assert.equal(result.onMatch.goals.value, 1)
  assert.equal(result.streaks.goals.value, 1)
  assert.equal(result.seasons.goals.value, null)
})

test('competition scope applies to records, streaks and seasons without changing input or other scopes', () => {
  const input = [row('league'), row('cup', 2, { goals: 0 }, { competition_type: 'CUP' }), row('league2', 3)]
  assert.equal(build(input, owner).streaks.goals.value, 1)
  const result = build(input, owner, ['LEAGUE'])
  assert.equal(result.matches.length, 2)
  assert.equal(result.streaks.goals.value, 2)
  assert.equal(result.seasons.goals.value, 2)
})

test('empty, all-bench, very short and invalid-date inputs remain honest and finite', () => {
  const empty = build([], owner)
  assert.equal(empty.onMatch.goals.value, null)
  assert.equal(empty.streaks.goals.value, null)
  assert.equal(empty.seasons.goals.value, null)
  assert.equal(build([row('a')], owner).streaks.goals.value, 1)
  const bench = build([row('a', 1, { has_played: false })], owner)
  assert.equal(bench.onMatch.goals.value, null)
  assert.equal(bench.streaks.goals.value, null)
  assert.equal(bench.seasons.appearances.value, 0)
  const invalid = build([row('bad', 1, {}, { match_date: '2026-02-30' })], owner)
  assert.equal(invalid.matches.length, 0)
  assert.equal(invalid.invalidDates, 1)
})

function clientFixture(rows, options = {}) {
  const queries = []
  const client = { auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: owner } } }) }, from(table) {
    const q = { table }; queries.push(q)
    const builder = { select(projection) { q.projection = projection; return builder }, eq(key, value) { q.owner = [key, value]; return builder }, order(key) { q.order = key; return builder }, range(start, end) {
      q.range = [start, end]
      return Promise.resolve(options.error ? { data: null, error: { code: 'SYNTHETIC_FAILURE' } } : { data: rows.filter(r => r[q.owner[0]] === q.owner[1]).slice(start, end + 1), error: null })
    } }
    return builder
  } }
  return { client, queries }
}

test('loader paginates every owned match, uses the precise SEC-002 relation and never reads manual careers', async () => {
  const fixture = clientFixture([...Array.from({ length: 1001 }, (_, i) => row(String(i))), row('foreign', 1, {}, { player_id: other })])
  const result = await loadPersonalRecords(fixture.client, owner)
  assert.equal(result.length, 1001)
  assert.equal(fixture.queries.length, 2)
  for (const q of fixture.queries) {
    assert.equal(q.table, 'matches')
    assert.equal(q.projection, RECORDS_SELECT)
    assert.deepEqual(q.owner, ['player_id', owner])
    assert.equal(q.order, 'id')
  }
  assert.ok(RECORDS_SELECT.includes('statistics!statistics_match_id_fkey('))
})

async function page(rows = [], options = {}) {
  const fixture = clientFixture(rows, options)
  const filters = []
  const component = value => ({ __esModule: true, default: value })
  const Page = loadUiModule('src/app/dashboard/records/page.tsx', {
    '@/utils/navigation': loadUiModule('src/utils/navigation.ts', { './competitionFilters': competitions }, { URLSearchParams }),
    '../components/PerformanceNavigation': component(() => null),
    '@/utils/playerStats': { getCurrentSeason: () => ({ startYear: 2026 }) },
    '@/utils/seasonNavigation': seasonNavigation,
    '@/utils/supabase/server': { createClient: async () => fixture.client },
    '@/utils/loadPersonalRecords': { loadPersonalRecords }, '@/utils/personalRecords': recordsModule,
    '@/utils/competitionFilters': competitions,
    'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`) } },
    'next/link': component(({ children, ...props }) => React.createElement('a', props, children)),
    '../components/CompetitionFilter': component(props => { filters.push(props); return null }),
  }).default
  const tree = await Page({ searchParams: Promise.resolve(options.params ?? {}) })
  return { html: renderToStaticMarkup(tree), ...fixture, filters }
}

test('page preserves authentication and never reads records for anonymous visitors', async () => {
  await assert.rejects(page([], { anonymous: true }), /REDIRECT:\/login/)
})

test('page shows an empty book and career link without fabricated records or a fictitious player', async () => {
  const { html, queries } = await page()
  assert.match(html, /Aucun match enregistré dans FootStats/)
  assert.match(html, /Tes saisons historiques restent dans ta carrière/)
  assert.match(html, /href="\/dashboard\/career"/)
  assert.match(html, /href="\/dashboard\/add-match"/)
  assert.doesNotMatch(html, /data-record-value|Alex Terrain|createSeasonDemoData/)
  assert.ok(queries.every(q => q.table === 'matches'))
})

test('page renders all nine calculated indicators, ties, rule explanations and matching seasonal deep links', async () => {
  const { html } = await page([row('b', 2, { goals: 3 }), row('a', 1, { goals: 3 })])
  assert.equal((html.match(/data-record="/g) ?? []).length, 9)
  assert.match(html, /2 performances ex æquo/)
  assert.match(html, /href="\/dashboard\/edit-match\/a"/)
  assert.match(html, /href="\/dashboard\?season=2026-2027"/)
  assert.match(html, /Records des matchs saisis/)
  assert.match(html, /faute d’ordre de coup d’envoi/)
  assert.match(html, /hors saisons manuelles de carrière/)
  assert.doesNotMatch(html, /NaN|Infinity|undefined/)
})

test('page respects competition scope and reconciles invalid filters explicitly', async () => {
  const rows = [row('league'), row('cup', 2, { goals: 5 }, { competition_type: 'CUP' })]
  const selected = await page(rows, { params: { comps: 'CUP', player_id: other } })
  assert.match(selected.html, /href="\/dashboard\?season=2026-2027&amp;comps=CUP"/)
  assert.doesNotMatch(selected.html, /Fixture league/)
  assert.ok(selected.queries.every(q => q.owner[1] === owner))
  const invalid = await page(rows, { params: { comps: ['UNKNOWN'] } })
  assert.match(invalid.html, /compétitions demandées ne sont pas disponibles/)
  assert.deepEqual(plain(invalid.filters[0].selected), ['LEAGUE', 'CUP'])
})

test('failed reads become a user-facing error, never an empty book or a 404', async () => {
  await assert.rejects(page([], { error: true }), /Impossible de charger tes records/)
})

test('rich local demo computes real maxima, ties, runs and partial seasons, leaving manual-only seasons out', () => {
  const demo = createRecordDemoData(2026)
  const rows = demo.matches.map(match => ({ ...match, statistics: demo.statistics.find(stat => stat.match_id === match.id) ?? null }))
  const result = build(rows, demo.profiles[0].id)
  assert.equal(result.onMatch.goals.value, 3)
  assert.equal(result.onMatch.assists.value, 3)
  assert.equal(result.onMatch.contributions.value, 5)
  assert.equal(result.onMatch.goals.winners.length, 2)
  assert.equal(result.onMatch.assists.winners.length, 2)
  assert.equal(result.onMatch.contributions.winners.length, 2)
  assert.equal(result.streaks.goals.value, 5)
  assert.equal(result.streaks.contributions.value, 6)
  assert.equal(result.seasonCount, 3)
  assert.equal(result.seasons.goals.unknown, 1)
  assert.equal(result.seasons.goals.winners.includes(2024), false)
})

test('isolated demo empty, short and unknown variants exercise genuine page states', async () => {
  for (const scenario of ['empty', 'short', 'unknown']) {
    const demo = createRecordDemoData(2026, scenario)
    const rows = demo.matches.map(match => ({ ...match, statistics: demo.statistics.find(stat => stat.match_id === match.id) ?? null }))
    const result = build(rows, demo.profiles[0].id)
    assert.equal(result.matches.length, scenario === 'empty' ? 0 : scenario === 'short' ? 2 : 3)
    if (scenario === 'unknown') {
      assert.ok(Object.values(result.onMatch).every(record => record.value === null))
      assert.ok(Object.values(result.seasons).every(record => record.value === null))
    }
    const rendered = await page(rows)
    assert.doesNotMatch(rendered.html, /NaN|Infinity|undefined/)
  }
})
