import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createGoalsDemoData } from './fixtures/goals-demo.mjs'
import { createReviewDemoData } from './fixtures/review-demo.mjs'
import { DEMO_PLAYER_ID } from './fixtures/season-demo.mjs'

const now = new Date('2026-10-21T10:00:00Z')
const statsFor = (data, start) => data.matches.filter(match => match.match_date >= `${start}-07-01` && match.match_date < `${start + 1}-07-01`).map(match => data.statistics.find(stat => stat.match_id === match.id))
const goal = (data, metric, start = 2026) => data.season_goals.find(row => row.season_start === start && row.metric === metric)

test('goals fixtures provide reached, exceeded and progressing targets computed from real fictitious matches', () => {
  const data = createGoalsDemoData(2026, 'full', now)
  const played = statsFor(data, 2026).filter(stat => stat?.has_played === true)
  const sum = key => played.reduce((total, stat) => total + stat[key], 0)
  assert.equal(goal(data, 'goals').target, sum('goals'))
  assert.ok(goal(data, 'assists').target < sum('assists'))
  assert.ok(goal(data, 'appearances').target > played.length)
  assert.ok(goal(data, 'motm').target > played.filter(stat => stat.is_motm).length)
  assert.equal(data.season_goals.filter(row => row.season_start === 2026).length, 4)
  assert.ok(data.season_goals.every(row => row.player_id === DEMO_PLAYER_ID && row.target > 0))
  assert.equal(new Set(data.season_goals.map(row => `${row.player_id}/${row.season_start}/${row.metric}`)).size, data.season_goals.length)
})

test('private goal-only season, manual history and partially known season remain distinct', () => {
  const data = createGoalsDemoData(2026, 'full', now)
  assert.ok(data.season_goals.some(row => row.season_start === 2020))
  assert.equal(statsFor(data, 2020).length, 0)
  assert.ok(!data.career_entries.some(row => row.season_start === 2020))
  assert.ok(data.career_entries.some(row => row.season_start === 2023))
  assert.equal(statsFor(data, 2023).length, 0)
  assert.ok(goal(data, 'goals', 2023))
  const partial = statsFor(data, 2021)
  assert.ok(partial.some(stat => stat.goals === null))
  assert.ok(partial.some(stat => stat.goals > 0))
  assert.ok(goal(data, 'goals', 2021))
})

test('short scenario has genuine known zeroes, unknown and empty scenarios retain unavailable data', () => {
  const short = createGoalsDemoData(2026, 'short', now)
  assert.equal(short.statistics.length, 2)
  assert.ok(short.statistics.every(stat => stat.has_played === true && stat.goals === 0 && stat.assists === 0 && stat.is_motm === false))
  const unknown = createGoalsDemoData(2026, 'unknown', now)
  assert.ok(unknown.statistics.some(stat => stat.has_played === null))
  assert.ok(unknown.statistics.every(stat => stat.goals === null && stat.assists === null && stat.is_motm === null))
  assert.ok(unknown.matches.length > unknown.statistics.length)
  const empty = createGoalsDemoData(2026, 'empty', now)
  assert.deepEqual(empty.matches, [])
  assert.deepEqual(empty.statistics, [])
  assert.ok(empty.season_goals.length > 0)
})

test('goals factory never mutates E1/E2/E3 source data or creates public goal-only history', () => {
  const original = createReviewDemoData(2026, 'full', now)
  const data = createGoalsDemoData(2026, 'full', now)
  const { season_goals, ...unchanged } = data
  unchanged.rbfa_cache[0].updated_at = original.rbfa_cache[0].updated_at
  assert.deepEqual(unchanged, original)
  season_goals[0].target = 999
  data.matches[0].opponent = 'changed'
  assert.notEqual(createGoalsDemoData(2026, 'full', now).season_goals[0].target, 999)
  assert.notEqual(createGoalsDemoData(2026, 'full', now).matches[0].opponent, 'changed')
})

async function localAdapter(t, allowWrites = true, scenario = 'full') {
  const folder = mkdtempSync(join(tmpdir(), 'footstats-goals-adapter-'))
  chmodSync(folder, 0o700)
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const path = join(folder, 'fixtures.json')
  const scenarios = Object.fromEntries(['full', 'short', 'unknown'].map(name => [name, createGoalsDemoData(2026, name, now)]))
  writeFileSync(path, JSON.stringify({ ...scenarios.full, scenarios }), { mode: 0o600 })
  const source = readFileSync(new URL('./fixtures/season-demo-server.mjs', import.meta.url), 'utf8')
    .replace("import { headers } from 'next/headers'", `const headers = async () => new Headers({'x-footstats-demo-scenario': '${scenario}'})`)
    .replace('__FIXTURE_PATH__', path)
    .replace('__ALLOW_GOAL_WRITES__', allowWrites ? 'true' : 'false')
  const adapter = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  return { client: await adapter.createClient(), read: () => JSON.parse(readFileSync(path, 'utf8')), path, source }
}

test('goal demo CRUD persists only private fake goals, once per awaited mutation and per scenario', async t => {
  const { client, read, path } = await localAdapter(t)
  const before = read()
  const query = client.from('season_goals').insert({ season_start: 2025, metric: 'motm', target: 3 }).select('id').single()
  const added = await query
  assert.equal(added.error, null)
  assert.equal(added.data.player_id, DEMO_PLAYER_ID)
  const repeated = await query
  assert.equal(repeated.data.id, added.data.id)
  assert.equal(read().scenarios.full.season_goals.length, before.scenarios.full.season_goals.length + 1)
  const id = added.data.id
  const updated = await client.from('season_goals').update({ target: 7 }).match({ id, player_id: DEMO_PLAYER_ID }).select('id').maybeSingle()
  assert.equal(updated.data.target, 7)
  const listed = await client.from('season_goals').select('id,target').eq('player_id', DEMO_PLAYER_ID).order('season_start').range(0, 999)
  assert.ok(listed.data.some(row => row.id === id && row.target === 7))
  assert.deepEqual(read().scenarios.short, before.scenarios.short)
  assert.deepEqual(read().scenarios.unknown, before.scenarios.unknown)
  for (const table of ['profiles', 'matches', 'statistics', 'career_entries', 'rbfa_cache']) assert.deepEqual(read().scenarios.full[table], before.scenarios.full[table])
  assert.equal(statSync(path).mode & 0o777, 0o600)
  const removed = await client.from('season_goals').delete().match({ id, player_id: DEMO_PLAYER_ID }).select('id').maybeSingle()
  assert.equal(removed.data.id, id)
  assert.deepEqual(read(), before)
})

test('fake goal writes refuse spoofing, invalid targets, duplicates, immutable fields and cross-owner requests', async t => {
  const { client, read } = await localAdapter(t)
  const before = read()
  const id = before.scenarios.full.season_goals[0].id
  const cases = [
    [client.from('season_goals').insert({ player_id: 'other', season_start: 2025, metric: 'motm', target: 1 }), '42501'],
    [client.from('season_goals').insert({ season_start: 2025, metric: 'motm', target: 0 }), '23514'],
    [client.from('season_goals').insert({ season_start: 2025, metric: 'motm', target: 1.5 }), '23514'],
    [client.from('season_goals').insert({ season_start: 2025, metric: 'motm', target: 2147483648 }), '23514'],
    [client.from('season_goals').insert({ season_start: 9999, metric: 'motm', target: 1 }), '23514'],
    [client.from('season_goals').insert({ season_start: 2025, metric: 'red_cards', target: 1 }), '23514'],
    [client.from('season_goals').insert({ season_start: 2026, metric: 'goals', target: 1 }), '23505'],
    [client.from('season_goals').update({ target: 1 }).eq('id', id).eq('player_id', 'other'), '42501'],
    [client.from('season_goals').delete().eq('id', id), '42501'],
    [client.from('season_goals').update({ season_start: 2025 }).eq('id', id).eq('player_id', DEMO_PLAYER_ID), '42501'],
    [client.from('season_goals').update({ player_id: 'other' }).eq('id', id).eq('player_id', DEMO_PLAYER_ID), '42501'],
  ]
  for (const [query, code] of cases) assert.equal((await query).error.code, code)
  assert.deepEqual(read(), before)
  const other = await client.from('season_goals').select().eq('player_id', 'other')
  assert.deepEqual(other.data, [])
})

test('demo denies every non-goal write, Auth mutation, RPC and Storage operation', async t => {
  const { client, read } = await localAdapter(t)
  const before = read()
  for (const table of ['profiles', 'matches', 'statistics', 'career_entries', 'rbfa_cache']) {
    for (const method of ['insert', 'update', 'delete', 'upsert']) await assert.rejects(client.from(table)[method]({}), /écriture désactivée/)
  }
  await assert.rejects(client.from('season_goals').upsert({}), /écriture désactivée/)
  for (const method of ['signOut', 'signInWithPassword', 'signUp']) await assert.rejects(client.auth[method]({}), /écriture désactivée/)
  await assert.rejects(client.rpc('save_match_with_statistics'), /écriture désactivée/)
  await assert.rejects(client.storage.from('avatars').upload('fake', {}), /écriture désactivée/)
  await assert.rejects(client.storage.from('avatars').remove(['fake']), /écriture désactivée/)
  assert.deepEqual(read(), before)
})

test('other preview modes keep all writes disabled by default', async t => {
  const { client, read } = await localAdapter(t, false)
  const before = read()
  for (const method of ['insert', 'update', 'delete']) await assert.rejects(client.from('season_goals')[method]({}), /écriture désactivée/)
  assert.deepEqual(read(), before)
  const template = readFileSync(new URL('./fixtures/season-demo-server.mjs', import.meta.url), 'utf8')
  assert.match(template, /const allowGoalWrites = '__ALLOW_GOAL_WRITES__' === 'true'/)
})

test('goals preview refuses production before creating any temporary copy', () => {
  const script = fileURLToPath(new URL('../scripts/preview-seasons.mjs', import.meta.url))
  for (const extra of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
    const result = spawnSync(process.execPath, [script, '3017', 'goals'], { encoding: 'utf8', env: { PATH: process.env.PATH, ...extra } })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Local development only/)
    assert.doesNotMatch(result.stdout, /Private preview|localhost/)
  }
})

test('no real application source imports goal fixtures or enables local scenario hooks', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url))
  const visit = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'design-preview') continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.(?:mjs|[jt]sx?)$/.test(entry.name)) assert.doesNotMatch(readFileSync(path, 'utf8'), /createGoalsDemoData|goals-demo\.mjs|x-footstats-demo-scenario|__ALLOW_GOAL_WRITES__|__FIXTURE_PATH__/, path)
    }
  }
  visit(root)
})
