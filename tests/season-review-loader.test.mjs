import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSeasonReviewStats, SEASON_REVIEW_SELECT } from '../src/utils/loadSeasonReviewStats.ts'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const season = { startYear: 2026, endYear: 2027, startDate: '2026-07-01', endDate: '2027-07-01' }
const row = (id, date = '2026-09-01', values = {}) => ({
  id, player_id: owner, has_played: true, minutes_played: 60, goals: 0, assists: 0,
  yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'CM',
  matches: { id: `match-${id}`, match_date: date, opponent: 'Équipe fictive', team_score: 1, opponent_score: 0, competition_type: 'LEAGUE' },
  ...values,
})

function clientFixture(rows, pages = {}) {
  const queries = []
  return { queries, client: { from(table) {
    const query = { table }; queries.push(query)
    const builder = {
      select(projection) { query.projection = projection; return builder },
      eq(key, value) { query.owner = [key, value]; return builder },
      gte(key, value) { query.start = [key, value]; return builder },
      lt(key, value) { query.end = [key, value]; return builder },
      order(key) { query.order = key; return builder },
      range(start, end) {
        query.range = [start, end]
        if (Object.hasOwn(pages, start)) return Promise.resolve(pages[start])
        const selected = rows.filter(stat => stat.player_id === query.owner[1]
          && stat.matches?.match_date >= query.start[1] && stat.matches.match_date < query.end[1])
        return Promise.resolve({ data: selected.slice(start, end + 1), error: null })
      },
    }
    // Only the read builder exists: any insert/update/delete/RPC fails this fixture.
    return builder
  } } }
}

test('season review reads only the owner and selected July-to-July season, with the existing inner relation', async () => {
  const fixture = clientFixture([
    row('previous', '2026-06-30'), row('first', '2026-07-01'), row('last', '2027-06-30'),
    row('next', '2027-07-01'), row('foreign', '2026-09-01', { player_id: other }),
    row('unlinked', '2026-09-01', { matches: null }),
  ])
  const result = await loadSeasonReviewStats(fixture.client, owner, season)
  assert.deepEqual(result.map(stat => stat.id), ['first', 'last'])
  assert.deepEqual(fixture.queries, [{
    table: 'statistics', projection: SEASON_REVIEW_SELECT, owner: ['player_id', owner],
    start: ['matches.match_date', '2026-07-01'], end: ['matches.match_date', '2027-07-01'],
    order: 'id', range: [0, 999],
  }])
  assert.equal(SEASON_REVIEW_SELECT.replaceAll(' ', ''), 'has_played,minutes_played,goals,assists,yellow_cards,red_cards,is_motm,position_played,matches!inner(id,match_date,opponent,team_score,opponent_score,competition_type)')
})

test('season review paginates beyond the API cap with deterministic non-overlapping ranges', async () => {
  const fixture = clientFixture(Array.from({ length: 2001 }, (_, index) => row(String(index))))
  const result = await loadSeasonReviewStats(fixture.client, owner, season)
  assert.equal(result.length, 2001)
  assert.equal(new Set(result.map(stat => stat.id)).size, 2001)
  assert.deepEqual(fixture.queries.map(query => query.range), [[0, 999], [1000, 1999], [2000, 2999]])
  for (const query of fixture.queries) {
    assert.equal(query.table, 'statistics')
    assert.deepEqual(query.owner, ['player_id', owner])
    assert.equal(query.order, 'id')
  }
})

test('a full final page is followed by an empty page and a genuinely empty season remains empty', async () => {
  const fixture = clientFixture(Array.from({ length: 1000 }, (_, index) => row(String(index))))
  assert.equal((await loadSeasonReviewStats(fixture.client, owner, season)).length, 1000)
  assert.equal(fixture.queries.length, 2)
  assert.deepEqual(await loadSeasonReviewStats(clientFixture([]).client, owner, season), [])
})

test('unknown fields and discipline without participation are returned intact without normalization or writes', async () => {
  const unknown = row('unknown', '2026-09-01', {
    has_played: null, minutes_played: null, goals: null, assists: null,
    yellow_cards: null, red_cards: null, is_motm: null, position_played: null,
  })
  const bench = row('bench', '2026-09-02', { has_played: false, minutes_played: 0, yellow_cards: 2, red_cards: 1 })
  const original = structuredClone([unknown, bench])
  const fixture = clientFixture([unknown, bench])
  const result = await loadSeasonReviewStats(fixture.client, owner, season)
  assert.deepEqual(result, original)
  assert.equal(result[0], unknown)
  assert.equal(result[1], bench)
})

test('database errors and missing responses never become a falsely empty or partial season', async () => {
  const logs = []
  const originalError = console.error
  console.error = (...args) => { logs.push(args) }
  try {
    for (const response of [
      { data: null, error: { code: 'SYNTHETIC_DENIED', message: 'PRIVATE_ERROR_CONTENT' } },
      { data: null, error: null },
    ]) {
      const fixture = clientFixture([], { 0: response })
      await assert.rejects(loadSeasonReviewStats(fixture.client, owner, season), /Impossible de charger le bilan de ta saison/)
    }
    const fixture = clientFixture(Array.from({ length: 1000 }, (_, index) => row(String(index))), {
      1000: { data: null, error: { code: 'SYNTHETIC_LATER_FAILURE', details: 'PRIVATE_ERROR_CONTENT' } },
    })
    await assert.rejects(loadSeasonReviewStats(fixture.client, owner, season), /Impossible de charger le bilan de ta saison/)
    assert.deepEqual(logs.map(entry => entry[1]), [{ code: 'SYNTHETIC_DENIED' }, { code: 'NO_DATA' }, { code: 'SYNTHETIC_LATER_FAILURE' }])
    assert.ok(!JSON.stringify(logs).includes('PRIVATE_ERROR_CONTENT'))
    assert.ok(!JSON.stringify(logs).includes(owner))
  } finally {
    console.error = originalError
  }
})
