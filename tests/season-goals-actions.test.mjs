import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as zod from 'zod'
import { loadUiModule } from './helpers/load-ui-module.mjs'

const model = loadUiModule('src/utils/seasonGoals.ts')
const validation = loadUiModule('src/app/dashboard/goals/goal-form.ts', { zod, '@/utils/seasonGoals': model })
const owner = '10000000-0000-4000-8000-000000000001'
const goalId = '20000000-0000-4000-8000-000000000001'
const idle = { status: 'idle', message: '' }
const form = (values = {}) => {
  const data = new FormData()
  for (const [key, value] of Object.entries({ season_start: '2026', metric: 'goals', target: '15', goal_id: goalId, ...values })) {
    if (value !== null) data.set(key, value)
  }
  return data
}

function actions(options = {}) {
  const queries = [], logs = [], revalidation = []
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === null ? null : { id: owner } }, error: options.authError ?? null }) },
    from(table) {
      const query = { table }; queries.push(query)
      const builder = {
        insert(payload) { query.operation = 'insert'; query.payload = payload; return builder },
        update(payload) { query.operation = 'update'; query.payload = payload; return builder },
        delete() { query.operation = 'delete'; return builder },
        match(filters) { query.filters = filters; return builder },
        select(projection) { query.select = projection; return builder },
        maybeSingle: async () => ({ data: Object.hasOwn(options, 'row') ? options.row : { id: goalId }, error: options.dbError ?? null }),
      }
      return builder
    },
  }
  return {
    ...loadUiModule('src/app/dashboard/goals/actions.ts', {
      'next/cache': { revalidatePath: (...args) => revalidation.push(args) },
      '@/utils/supabase/server': { createClient: async () => client },
      './goal-form': validation,
    }, { console: { error: (...args) => logs.push(args) } }),
    queries, logs, revalidation,
  }
}

test('positive targets and season bounds are identical to the SQL integer constraints', () => {
  for (const target of ['1', '15', '2147483647']) assert.equal(validation.parseCreateGoalFormData(form({ target })).success, true)
  for (const target of ['', ' ', '0', '-1', '1.5', '1e2', '0x10', 'Infinity', 'NaN', '2147483648', null]) {
    assert.equal(validation.parseCreateGoalFormData(form({ target })).success, false, String(target))
    assert.equal(validation.parseUpdateGoalFormData(form({ target })).success, false, String(target))
  }
  for (const season_start of ['1', '1880', '2026', '9998']) assert.equal(validation.parseCreateGoalFormData(form({ season_start })).success, true)
  for (const season_start of ['', '0', '-1', '2026.5', '9999', null]) assert.equal(validation.parseCreateGoalFormData(form({ season_start })).success, false)
  for (const metric of ['goals', 'assists', 'appearances', 'motm']) assert.equal(validation.parseCreateGoalFormData(form({ metric })).success, true)
  for (const metric of ['', 'minutes', 'wins', 'GOALS', null]) assert.equal(validation.parseCreateGoalFormData(form({ metric })).success, false)
})

test('all three actions verify auth before reading or writing data; auth errors do not leak details', async () => {
  for (const options of [{ user: null }, { authError: { code: 'SYNTHETIC_AUTH', message: 'PRIVATE_DETAIL' } }]) {
    const fixture = actions(options)
    for (const name of ['createSeasonGoal', 'updateSeasonGoal', 'deleteSeasonGoal']) {
      const state = await fixture[name](idle, form())
      assert.equal(state.status, 'error')
      assert.doesNotMatch(state.message, /PRIVATE_DETAIL|SYNTHETIC/)
    }
    assert.equal(fixture.queries.length, 0)
    assert.equal(fixture.revalidation.length, 0)
    assert.doesNotMatch(JSON.stringify(fixture.logs), /PRIVATE_DETAIL/)
  }
})

test('invalid inputs stop before a database operation and preserve field-specific feedback', async () => {
  for (const change of [{ target: '' }, { target: '0' }, { target: '1.5' }, { season_start: '10000' }, { metric: 'red_cards' }]) {
    const fixture = actions()
    const state = await fixture.createSeasonGoal(idle, form(change))
    assert.equal(state.status, 'error')
    assert.ok(Object.keys(state.fieldErrors).length > 0)
    assert.equal(fixture.queries.length, 0)
  }
  for (const name of ['updateSeasonGoal', 'deleteSeasonGoal']) {
    const fixture = actions()
    assert.equal((await fixture[name](idle, form({ goal_id: 'forged' }))).status, 'error')
    assert.equal(fixture.queries.length, 0)
  }
})

test('creation derives the owner from the JWT default and sends only three validated fields', async () => {
  const fixture = actions()
  const state = await fixture.createSeasonGoal(idle, form({ player_id: 'forged-owner', id: 'forged-id', created_at: 'forged-date' }))
  assert.equal(state.status, 'success')
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.queries)), [{ table: 'season_goals', operation: 'insert', payload: { season_start: 2026, metric: 'goals', target: 15 }, select: 'id' }])
  assert.deepEqual(fixture.revalidation, [['/dashboard/goals']])
})

test('historical seasons remain creatable and a target update never changes owner, season or metric', async () => {
  const fixture = actions()
  assert.equal((await fixture.createSeasonGoal(idle, form({ season_start: '1980' }))).status, 'success')
  assert.equal(fixture.queries[0].payload.season_start, 1980)
  const state = await fixture.updateSeasonGoal(idle, form({ target: '25', season_start: '1900', metric: 'assists', player_id: 'forged' }))
  assert.equal(state.status, 'success')
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.queries[1])), {
    table: 'season_goals', operation: 'update', payload: { target: 25 }, filters: { id: goalId, player_id: owner }, select: 'id',
  })
})

test('deletion always filters by the authenticated owner and does not touch matches or statistics', async () => {
  const fixture = actions()
  assert.equal((await fixture.deleteSeasonGoal(idle, form({ player_id: 'forged-owner' }))).status, 'success')
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.queries)), [{ table: 'season_goals', operation: 'delete', filters: { id: goalId, player_id: owner }, select: 'id' }])
  assert.deepEqual(fixture.revalidation, [['/dashboard/goals']])
})

test('owner-mismatched or absent goals remain errors and never trigger success revalidation', async () => {
  for (const name of ['updateSeasonGoal', 'deleteSeasonGoal']) {
    const fixture = actions({ row: null })
    const state = await fixture[name](idle, form())
    assert.equal(state.status, 'error')
    assert.match(state.message, /introuvable ou ne t’appartient pas/)
    assert.deepEqual(JSON.parse(JSON.stringify(fixture.queries[0].filters)), { id: goalId, player_id: owner })
    assert.equal(fixture.revalidation.length, 0)
  }
})

test('duplicate goals return a helpful message without revealing backend details', async () => {
  const fixture = actions({ dbError: { code: '23505', message: 'PRIVATE_DETAIL', details: 'PRIVATE_PLAYER' } })
  const state = await fixture.createSeasonGoal(idle, form())
  assert.equal(state.status, 'error')
  assert.match(state.message, /existe déjà.*Modifie sa cible/)
  assert.doesNotMatch(JSON.stringify([state, fixture.logs]), /PRIVATE_DETAIL|PRIVATE_PLAYER/)
  assert.equal(fixture.revalidation.length, 0)
})

test('all database errors remain form errors with operation/code-only logging', async () => {
  for (const name of ['createSeasonGoal', 'updateSeasonGoal', 'deleteSeasonGoal']) {
    const fixture = actions({ dbError: { code: '42501', message: 'PRIVATE_DETAIL', details: 'PRIVATE_PLAYER' } })
    assert.equal((await fixture[name](idle, form())).status, 'error')
    assert.equal(fixture.logs[0][1].code, '42501')
    assert.doesNotMatch(JSON.stringify(fixture.logs), /PRIVATE_DETAIL|PRIVATE_PLAYER|10000000/)
    assert.equal(fixture.revalidation.length, 0)
  }
  const fixture = actions({ row: null })
  assert.equal((await fixture.createSeasonGoal(idle, form())).status, 'error')
  assert.equal(fixture.revalidation.length, 0)
})
