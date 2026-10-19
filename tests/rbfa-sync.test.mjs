import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as rbfaDate from '../src/utils/rbfaDate.ts'

const require = createRequire(import.meta.url)
function load(path, mocks) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new vm.Script(compiled, { filename: path }).runInContext(vm.createContext({
    module: loaded, exports: loaded.exports, AbortSignal, AbortController,
    URL, URLSearchParams, setTimeout, clearTimeout,
    fetch() { assert.fail('Live network access is forbidden in RBFA tests') },
    require(name) {
      if (name in mocks) return mocks[name]
      if (name === 'zod') return require(name)
      throw new Error(`Unexpected sync dependency: ${name}`)
    },
  }))
  return loaded.exports
}
const contracts = load('src/utils/rbfa-contracts.ts', { './rbfaDate': rbfaDate })
const { synchronizeRbfa, RbfaSyncError, RBFA_SYNC_LIMITS } = load('src/services/rbfa-sync.ts', {
  '@/utils/rbfa-contracts': contracts, '@/utils/rbfaDate': rbfaDate,
})
const NOW = Date.parse('2026-10-19T12:00:00Z')
const KEY = 'SYNTHETIC_API_KEY_NOT_A_REAL_SECRET'
const match = () => ({
  id: 'synthetic-upcoming', startTime: '2026-11-01T15:00:00+01:00',
  homeTeam: { name: 'Synthetic home', logo: null },
  awayTeam: { name: 'Synthetic away', logo: null }, series: { name: 'Synthetic league' },
  additional: { retained: true },
})
const rankings = () => ({
  teams: [{ teamId: '101', name: 'Synthetic home', logo: null,
    position: 1, points: 5, matchesPlayed: 3, goalDifference: -1 }], extra: 'retained',
})
const envelope = (operation, upcoming = match(), table = rankings()) => operation === 'GetUpcomingMatch'
  ? { data: { upcomingMatch: upcoming } }
  : { data: { teamSeriesAndRankings: { rankings: [{ rankings: [table] }] } } }
const initialRow = (id, values = {}) => ({
  team_id: id, upcoming_match: { ...match(), id: `old-${id}` }, rankings: rankings(),
  updated_at: '2026-10-18T12:00:00Z', ...values,
})
const plain = value => JSON.parse(JSON.stringify(value))

function fixture(options = {}) {
  const calls = { requests: [], writes: [], reads: [], active: 0, maximumActive: 0 }
  const cache = new Map((options.cache ?? [initialRow('101'), initialRow('102'), initialRow('999')])
    .map(row => [row.team_id, structuredClone(row)]))
  const store = {
    async loadTeamIds(signal) {
      calls.reads.push({ source: 'profiles', signal })
      if (options.source) return options.source(signal)
      return options.ids ?? ['101', '102']
    },
    async loadCache(ids, signal) {
      calls.reads.push({ source: 'rbfa_cache', ids: [...ids], signal })
      if (options.cacheRead) return options.cacheRead(signal)
      return ids.map(id => cache.get(id)).filter(Boolean).map(row => structuredClone(row))
    },
    async upsert(row, signal) {
      calls.writes.push({ row, signal })
      if (options.write) await options.write(row, signal)
      if (!signal.aborted) cache.set(row.team_id, structuredClone(row))
    },
  }
  const fetcher = async (input, init) => {
    const url = new URL(input)
    assert.equal(url.protocol, 'https:')
    assert.equal(url.host, 'api.scraperapi.com')
    assert.equal(url.searchParams.get('api_key'), KEY)
    assert.equal(url.searchParams.get('url'), 'https://datalake-prod2018.rbfa.be/graphql')
    assert.equal(init.method, 'POST')
    assert.equal(init.cache, 'no-store')
    assert.ok(init.signal instanceof AbortSignal)
    const body = JSON.parse(init.body)
    assert.equal(body.variables.language, 'fr')
    assert.match(body.extensions.persistedQuery.sha256Hash, /^[a-f0-9]{64}$/)
    const request = { teamId: body.variables.teamId, operation: body.operationName, signal: init.signal }
    calls.requests.push(request)
    calls.active++
    calls.maximumActive = Math.max(calls.maximumActive, calls.active)
    try {
      const reply = options.respond ? await options.respond(request) : undefined
      return reply ?? Response.json(envelope(request.operation))
    } finally { calls.active-- }
  }
  return {
    calls, cache,
    snapshot: () => JSON.stringify([...cache]),
    run: limits => synchronizeRbfa({
      store, fetcher, scraperApiKey: KEY, now: () => NOW,
      limits: limits ?? { jobMs: 1000, requestMs: 250, databaseMs: 250 },
    }),
  }
}

function untilAborted(signal) {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new Error(`Private transport URL contains ${KEY}`))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

test('sync targets only distinct numeric IDs linked to profiles, and never deletes an old team cache', async () => {
  const f = fixture({ ids: ['102', ' 101 ', '101', null, '', ' ', 'bad-id', 10, {}] })
  const oldUnlinked = structuredClone(f.cache.get('999'))
  const result = await f.run()
  assert.deepEqual(f.calls.reads[1].ids, ['101', '102'])
  assert.deepEqual([...new Set(f.calls.requests.map(call => call.teamId))], ['101', '102'])
  assert.equal(f.calls.requests.length, 4)
  assert.equal(result.summary.invalidTeamIds, 3)
  assert.equal(result.success, false)
  assert.deepEqual(f.cache.get('999'), oldUnlinked)
})

test('successful snapshots preserve JSON fields and timestamp offsets, with a reliable write summary', async () => {
  const f = fixture()
  const result = await f.run()
  assert.equal(result.success, true)
  assert.deepEqual(plain(result.summary), {
    teams: 2, updated: 2, unchanged: 0, failed: 0, skipped: 0,
    writesSucceeded: 2, writesFailed: 0, invalidTeamIds: 0,
  })
  assert.ok(f.calls.maximumActive <= 2)
  for (const { row } of f.calls.writes) {
    assert.deepEqual(row.upcoming_match, match())
    assert.deepEqual(row.rankings, rankings())
    assert.equal(row.updated_at, new Date(NOW).toISOString())
  }
})

test('profiles with no linked team cause no API calls, cache reads or writes', async () => {
  const f = fixture({ ids: [null, '', ' '] })
  const before = f.snapshot()
  const result = await f.run()
  assert.equal(result.success, true)
  assert.equal(result.summary.teams, 0)
  assert.equal(f.calls.reads.length, 1)
  assert.equal(f.calls.requests.length + f.calls.writes.length, 0)
  assert.equal(f.snapshot(), before)
})

test('only valid explicit absence can clear an old upcoming match and ranking', async () => {
  const f = fixture({ ids: ['101'], respond: ({ operation }) => Response.json(operation === 'GetUpcomingMatch'
    ? { data: { upcomingMatch: null } }
    : { data: { teamSeriesAndRankings: { rankings: [] } } }) })
  const result = await f.run()
  assert.equal(result.success, true)
  assert.equal(f.cache.get('101').upcoming_match, null)
  assert.equal(f.cache.get('101').rankings, null)
})

test('HTTP 200 GraphQL errors, partial responses and malformed bodies never replace a valid snapshot', async t => {
  const failures = [
    ['GraphQL errors', () => Response.json({ ...envelope('GetUpcomingMatch'), errors: [{ message: KEY }] }), 'GRAPHQL_ERROR'],
    ['missing field', () => Response.json({ data: {} }), 'INVALID_RESPONSE'],
    ['partial match', () => Response.json({ data: { upcomingMatch: { homeTeam: { name: 'Synthetic' } } } }), 'INVALID_RESPONSE'],
    ['invalid JSON', () => new Response('INVALID_PRIVATE_PROVIDER_BODY'), 'INVALID_JSON'],
    ['HTTP failure', () => new Response(KEY, { status: 503 }), 'HTTP_ERROR'],
  ]
  for (const [name, response, reason] of failures) {
    await t.test(name, async () => {
      const f = fixture({ ids: ['101'], respond: ({ operation }) => operation === 'GetUpcomingMatch' ? response() : undefined })
      const before = f.snapshot()
      const result = await f.run()
      assert.equal(result.success, false)
      assert.equal(result.results[0].reason, reason)
      assert.equal(result.results[0].cache, 'preserved')
      assert.equal(f.calls.writes.length, 0)
      assert.equal(f.snapshot(), before)
      assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_API_KEY|PRIVATE_PROVIDER_BODY/)
    })
  }
})

test('a failed ranking response also preserves both old fields, even when no upcoming match is confirmed', async () => {
  const f = fixture({ ids: ['101'], respond: ({ operation }) => Response.json(operation === 'GetUpcomingMatch'
    ? { data: { upcomingMatch: null } }
    : { data: { teamSeriesAndRankings: { rankings: null } } }) })
  const before = f.snapshot()
  const result = await f.run()
  assert.equal(result.results[0].reason, 'INVALID_RESPONSE')
  assert.equal(f.calls.writes.length, 0)
  assert.equal(f.snapshot(), before)
})

test('one team failure does not stop a later team from completing its snapshot', async () => {
  const f = fixture({ respond: ({ teamId }) => teamId === '101'
    ? Response.json({ errors: [{ message: KEY }] }) : undefined })
  const oldFailed = structuredClone(f.cache.get('101'))
  const result = await f.run()
  assert.equal(result.success, false)
  assert.equal(result.summary.failed, 1)
  assert.equal(result.summary.updated, 1)
  assert.equal(result.summary.writesSucceeded, 1)
  assert.deepEqual(f.cache.get('101'), oldFailed)
  assert.deepEqual(f.calls.writes.map(({ row }) => row.team_id), ['102'])
})

test('an upsert error is counted and does not falsely report success or stop other teams', async () => {
  const f = fixture({ write: async row => {
    if (row.team_id === '101') throw new RbfaSyncError('DATABASE_WRITE_ERROR')
  } })
  const result = await f.run()
  assert.equal(result.summary.writesFailed, 1)
  assert.equal(result.summary.writesSucceeded, 1)
  assert.equal(result.results[0].cache, 'unknown')
  assert.equal(result.results[0].reason, 'DATABASE_WRITE_ERROR')
  assert.equal(result.results[1].status, 'updated')
})

test('unchanged content still refreshes updated_at after a verified write', async () => {
  const reordered = { additional: { retained: true }, series: { name: 'Synthetic league' },
    awayTeam: { logo: null, name: 'Synthetic away' }, homeTeam: { logo: null, name: 'Synthetic home' },
    startTime: match().startTime, id: match().id }
  const f = fixture({ ids: ['101'], cache: [initialRow('101', { upcoming_match: reordered })] })
  const result = await f.run()
  assert.equal(result.summary.unchanged, 1)
  assert.equal(result.summary.updated, 0)
  assert.equal(result.summary.writesSucceeded, 1)
  assert.equal(result.results[0].cache, 'refreshed')
  assert.equal(f.cache.get('101').updated_at, new Date(NOW).toISOString())
})

test('a supposedly upcoming response in the past is rejected, not converted to a confirmed absence', async () => {
  const f = fixture({ ids: ['101'], respond: ({ operation }) => operation === 'GetUpcomingMatch'
    ? Response.json(envelope(operation, { ...match(), startTime: new Date(NOW).toISOString() })) : undefined })
  const before = f.snapshot()
  const result = await f.run()
  assert.equal(result.results[0].reason, 'STALE_UPCOMING_MATCH')
  assert.equal(f.calls.writes.length, 0)
  assert.equal(f.snapshot(), before)
})

test('historical ISO dates do not reject synchronization or get rewritten, and report the unresolved timezone', async () => {
  for (const startTime of ['2026-01-25T14:30:00', '2026-07-25T14:30:00.123',
    '2026-03-29T02:30:00', '2026-10-25T02:30:00']) {
    const f = fixture({ respond: ({ teamId, operation }) => teamId === '101' && operation === 'GetUpcomingMatch'
      ? Response.json(envelope(operation, { ...match(), startTime })) : undefined })
    const result = await f.run()
    assert.equal(result.success, true)
    assert.equal(result.summary.writesSucceeded, 2)
    assert.equal(f.cache.get('101').upcoming_match.startTime, startTime)
    assert.equal(result.results.find(row => row.teamId === '101').warning, 'TIME_ZONE_UNCONFIRMED')
    assert.equal(result.results.find(row => row.teamId === '102').warning, undefined)
  }
})

test('a fetch timeout aborts the slow team and lets the next team finish', async () => {
  const f = fixture({ respond: ({ teamId, signal }) => teamId === '101' ? untilAborted(signal) : undefined })
  const result = await f.run({ jobMs: 1000, requestMs: 10, databaseMs: 250 })
  assert.equal(result.results[0].reason, 'REQUEST_TIMEOUT')
  assert.equal(result.results[0].cache, 'preserved')
  assert.equal(result.results[1].status, 'updated')
  assert.ok(f.calls.requests.filter(call => call.teamId === '101').every(call => call.signal.aborted))
  assert.ok(f.calls.maximumActive <= 2)
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_API_KEY|Private transport/)
})

test('the timeout includes reading a slow JSON response body', async () => {
  const f = fixture({ ids: ['101'], respond: ({ signal }) => ({ ok: true, json: () => untilAborted(signal) }) })
  const result = await f.run({ jobMs: 1000, requestMs: 10, databaseMs: 250 })
  assert.equal(result.results[0].reason, 'REQUEST_TIMEOUT')
  assert.equal(f.calls.writes.length, 0)
})

test('database source/cache read failures abort without API calls or mutations', async () => {
  for (const failure of ['source', 'cacheRead']) {
    const f = fixture({ [failure]: async () => { throw new RbfaSyncError('DATABASE_READ_ERROR') } })
    const before = f.snapshot()
    await assert.rejects(f.run(), { code: 'DATABASE_READ_ERROR' })
    assert.equal(f.calls.requests.length + f.calls.writes.length, 0)
    assert.equal(f.snapshot(), before)
  }
})

test('database deadlines cancel slow reads and writes', async () => {
  const read = fixture({ source: untilAborted })
  await assert.rejects(read.run({ jobMs: 1000, requestMs: 250, databaseMs: 10 }), { code: 'DATABASE_TIMEOUT' })
  assert.equal(read.calls.requests.length, 0)
  const write = fixture({ ids: ['101'], write: (_row, signal) => untilAborted(signal) })
  const result = await write.run({ jobMs: 1000, requestMs: 250, databaseMs: 10 })
  assert.equal(result.results[0].reason, 'DATABASE_TIMEOUT')
  assert.equal(result.results[0].cache, 'unknown')
  assert.equal(result.summary.writesFailed, 1)
})

test('the overall job deadline cancels pending work and marks remaining teams as skipped', async () => {
  const f = fixture({ ids: ['101', '102', '103'], respond: ({ signal }) => untilAborted(signal) })
  const before = f.snapshot()
  const result = await f.run({ jobMs: 15, requestMs: 1000, databaseMs: 1000 })
  assert.equal(result.results[0].reason, 'JOB_TIMEOUT')
  assert.equal(result.summary.failed, 1)
  assert.equal(result.summary.skipped, 2)
  assert.equal(f.calls.requests.length, 2)
  assert.equal(f.snapshot(), before)
})

test('oldest or missing cache snapshots take priority within the same bounded cron budget', async () => {
  const f = fixture({ ids: ['101', '102', '103'], cache: [
    initialRow('101', { updated_at: '2026-10-18T12:00:00Z' }),
    initialRow('102', { updated_at: '2026-10-10T12:00:00Z' }),
  ] })
  await f.run()
  assert.deepEqual(f.calls.writes.map(({ row }) => row.team_id), ['103', '102', '101'])
  assert.equal(RBFA_SYNC_LIMITS.jobMs, 55_000)
  assert.equal(RBFA_SYNC_LIMITS.requestMs, 20_000)
  assert.equal(RBFA_SYNC_LIMITS.databaseMs, 5_000)
})
