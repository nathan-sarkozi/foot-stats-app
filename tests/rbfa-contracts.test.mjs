import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as rbfaDate from '../src/utils/rbfaDate.ts'

const require = createRequire(import.meta.url)
const path = 'src/utils/rbfa-contracts.ts'
const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
  fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const fileModule = { exports: {} }
new vm.Script(compiled, { filename: path }).runInContext(vm.createContext({
  module: fileModule,
  exports: fileModule.exports,
  require(name) {
    if (name === 'zod') return require(name)
    if (name === './rbfaDate') return rbfaDate
    throw new Error(`Unexpected RBFA contract dependency: ${name}`)
  },
}))

const {
  UpcomingMatchSchema, RankingsSchema, RbfaDataError,
  parseUpcomingResponse, parseRankingsResponse,
} = fileModule.exports

const match = () => ({
  id: 'synthetic-match',
  startTime: '2026-10-25T14:30:00+01:00',
  homeTeam: { id: '101', name: 'Synthetic home', logo: null },
  awayTeam: { id: '102', name: 'Synthetic away', logo: '' },
  series: { name: 'Synthetic series', id: 'synthetic-series' },
  venue: { name: 'Synthetic field' },
})
const row = () => ({
  teamId: '101', name: 'Synthetic home', logo: null,
  position: 1, points: 12, matchesPlayed: 5, goalDifference: -2,
  wins: 4,
})
const table = () => ({ teams: [row()], seriesId: 'synthetic-series' })
const upcoming = value => ({ data: { upcomingMatch: value } })
const rankings = value => ({ data: { teamSeriesAndRankings: { rankings: [{ rankings: [value] }] } } })
const invalidResponse = callback => assert.throws(callback, {
  name: 'RbfaDataError', code: 'INVALID_RESPONSE',
  message: 'La réponse RBFA est invalide ou incomplète.',
})

test('a complete upcoming match preserves names, timestamps and additional cached fields', () => {
  const value = match()
  const snapshot = structuredClone(value)
  assert.deepEqual(parseUpcomingResponse(upcoming(value)), value)
  assert.deepEqual(value, snapshot)
  assert.deepEqual(UpcomingMatchSchema.parse(value), value)
})

test('only an explicit null upcomingMatch confirms that no next match is scheduled', () => {
  assert.equal(parseUpcomingResponse(upcoming(null)), null)
  for (const data of [{}, { upcomingMatch: undefined }, { upcomingMatch: [] }, { upcomingMatch: false }]) {
    invalidResponse(() => parseUpcomingResponse({ data }))
  }
})

test('a match with an explicitly unknown date remains valid and keeps optional display data', () => {
  const value = match()
  value.startTime = null
  delete value.series
  delete value.homeTeam.logo
  assert.deepEqual(parseUpcomingResponse(upcoming(value)), value)
})

test('missing team names or nested match fields are incomplete responses, never empty results', () => {
  const changes = [
    value => { delete value.homeTeam },
    value => { value.homeTeam = null },
    value => { delete value.awayTeam.name },
    value => { value.homeTeam.name = ' ' },
    value => { value.awayTeam.logo = {} },
    value => { value.series = [] },
    value => { delete value.startTime },
  ]
  for (const change of changes) {
    const value = match()
    change(value)
    invalidResponse(() => parseUpcomingResponse(upcoming(value)))
  }
})

test('invalid and non-string kickoff values cannot replace a valid cached match', () => {
  for (const startTime of [
    '', 'not-a-date', '2026-02-30T14:30:00', '2026-02-30T14:30:00Z',
    '2026-10-25T14:30:00+25:00', 1792935000000, {},
  ]) {
    invalidResponse(() => parseUpcomingResponse(upcoming({ ...match(), startTime })))
  }
})

test('UTC, explicit offsets and valid historical ISO strings remain exactly as received', () => {
  for (const startTime of [
    '2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z',
    '2026-10-25T02:30:00+02:00', '2026-10-25T02:30:00+01:00',
    '2026-01-25T14:30:00', '2026-07-25T14:30:00.123456789',
    '2026-03-29T02:30:00', '2026-10-25T02:30:00',
  ]) {
    assert.equal(parseUpcomingResponse(upcoming({ ...match(), startTime })).startTime, startTime)
  }
})

test('accepting historical ISO dates does not weaken GraphQL errors or required match fields', () => {
  const historical = { ...match(), startTime: '2026-10-25T14:30:00' }
  assert.throws(() => parseUpcomingResponse({
    ...upcoming(historical), errors: [{ message: 'Synthetic GraphQL failure' }],
  }), { code: 'GRAPHQL_ERROR' })
  delete historical.awayTeam
  invalidResponse(() => parseUpcomingResponse(upcoming(historical)))
})

test('GraphQL errors reject complete or partial data without exposing messages or extensions', () => {
  const secret = 'synthetic-private-detail-must-not-be-returned'
  for (const [parse, envelope] of [
    [parseUpcomingResponse, upcoming(match())],
    [parseUpcomingResponse, upcoming(null)],
    [parseRankingsResponse, rankings(table())],
    [parseRankingsResponse, { data: null }],
  ]) {
    const response = { ...envelope, errors: [{ message: secret, extensions: { token: secret } }] }
    assert.throws(() => parse(response), error => {
      assert.ok(error instanceof RbfaDataError)
      assert.equal(error.code, 'GRAPHQL_ERROR')
      assert.doesNotMatch(error.message, new RegExp(secret))
      assert.equal(error.cause, undefined)
      return true
    })
  }
})

test('an empty errors array is accepted while malformed errors never authorize cache replacement', () => {
  assert.deepEqual(parseUpcomingResponse({ ...upcoming(match()), errors: [] }), match())
  assert.deepEqual(parseRankingsResponse({ ...rankings(table()), errors: [] }), table())
  for (const errors of [null, {}, 'failure', false]) {
    invalidResponse(() => parseUpcomingResponse({ ...upcoming(match()), errors }))
    invalidResponse(() => parseRankingsResponse({ ...rankings(table()), errors }))
  }
})

test('missing, non-object or null GraphQL data are not successful empty results', () => {
  for (const input of [undefined, null, false, '', [], {}, { data: null }, { data: [] }, { data: '' }]) {
    invalidResponse(() => parseUpcomingResponse(input))
    invalidResponse(() => parseRankingsResponse(input))
  }
})

test('rankings preserve the first table of the first series and retain its additional fields', () => {
  const value = table()
  const snapshot = structuredClone(value)
  const response = rankings(value)
  response.data.teamSeriesAndRankings.rankings[0].rankings.push({ teams: [] })
  response.data.teamSeriesAndRankings.rankings.push({ rankings: [{ teams: [] }] })
  assert.deepEqual(parseRankingsResponse(response), value)
  assert.deepEqual(RankingsSchema.parse(value), value)
  assert.deepEqual(value, snapshot)
})

test('only explicit empty series or table arrays confirm that there is no ranking', () => {
  assert.equal(parseRankingsResponse({ data: { teamSeriesAndRankings: { rankings: [] } } }), null)
  assert.equal(parseRankingsResponse({ data: { teamSeriesAndRankings: { rankings: [{ rankings: [] }] } } }), null)
  assert.deepEqual(parseRankingsResponse(rankings({ teams: [] })), { teams: [] })
})

test('missing or null intermediate ranking paths cannot erase a previous ranking', () => {
  for (const data of [
    {}, { teamSeriesAndRankings: null }, { teamSeriesAndRankings: {} },
    { teamSeriesAndRankings: { rankings: null } },
    { teamSeriesAndRankings: { rankings: [null] } },
    { teamSeriesAndRankings: { rankings: [{}] } },
    { teamSeriesAndRankings: { rankings: [{ rankings: null }] } },
    { teamSeriesAndRankings: { rankings: [{ rankings: [null] }] } },
  ]) {
    invalidResponse(() => parseRankingsResponse({ data }))
  }
})

test('ranking rows accept historical numeric strings, numbers and explicit unknown values without coercion', () => {
  const value = { teams: [
    row(),
    { ...row(), teamId: 102, position: ' 2 ', points: '0', matchesPlayed: '5', goalDifference: '-3' },
    { ...row(), teamId: '103', position: null, points: null, matchesPlayed: null, goalDifference: null },
  ] }
  assert.deepEqual(parseRankingsResponse(rankings(value)), value)
})

test('all ranking fields displayed by the widget must be present, including explicit nulls', () => {
  for (const field of ['teamId', 'name', 'position', 'points', 'matchesPlayed', 'goalDifference']) {
    const value = row()
    delete value[field]
    invalidResponse(() => parseRankingsResponse(rankings({ teams: [value] })))
  }
})

test('invalid ranking tables or rows fail validation instead of publishing partial lists', () => {
  for (const value of [
    {}, { teams: null }, { teams: {} }, { teams: [null] },
    { teams: [row(), { ...row(), name: '' }] },
    { teams: [{ ...row(), teamId: null }] },
    { teams: [{ ...row(), points: 'unknown' }] },
    { teams: [{ ...row(), points: Infinity }] },
    { teams: [{ ...row(), matchesPlayed: {} }] },
    { teams: [{ ...row(), goalDifference: '' }] },
  ]) {
    invalidResponse(() => parseRankingsResponse(rankings(value)))
  }
})
