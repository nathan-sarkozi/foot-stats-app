import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicProfileDemoData, PROFILE_DEMO_IDS } from './fixtures/public-profile-demo.mjs'
import { renderServerPage } from './helpers/render-server-page.mjs'

const [complete, noPlayer, empty, unknown] = PROFILE_DEMO_IDS
async function fixture(t, anonymous = false) {
  const directory = mkdtempSync(join(tmpdir(), 'footstats-public-profile-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'data.json')
  const data = createPublicProfileDemoData(2026)
  writeFileSync(path, JSON.stringify(data), { mode: 0o600 })
  const source = readFileSync(new URL('./fixtures/season-demo-server.mjs', import.meta.url), 'utf8')
    .replace("import { headers } from 'next/headers'", `const headers = async () => new Headers({'x-footstats-demo-visitor':'${anonymous ? 'anonymous' : 'player'}'})`)
    .replace('__FIXTURE_PATH__', path).replace('__ALLOW_GOAL_WRITES__', 'false')
  const adapter = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  const client = await adapter.createClient(), queries = [], from = client.from.bind(client)
  client.from = table => { queries.push(table); return from(table) }
  const render = (id, suffix = '', params = {}) => renderServerPage(`src/app/profile/[userId]/${suffix}page.tsx`, { userId: id, client, searchParams: params })
  return { data, client, queries, render }
}

test('profile with matches but without players renders the same season metrics as a complete identity', async t => {
  const f = await fixture(t)
  assert.ok(f.data.players.some(row => row.id === complete))
  assert.ok(!f.data.players.some(row => row.id === noPlayer))
  const a = await f.render(complete), b = await f.render(noPlayer)
  assert.deepEqual(a.cards, b.cards)
  assert.equal(b.cards.find(card => card.title === 'Total Buts').value, 2)
  assert.equal(b.cards.find(card => card.title === 'Passes décisives').value, 1)
  assert.equal(b.cards.find(card => card.title === 'Matchs Joués').value, 1)
  assert.ok(!f.queries.includes('players'))
  assert.ok(!f.queries.includes('season_goals'))
})

test('another authenticated viewer sees only the requested player statistics, never mixed identities', async t => {
  const f = await fixture(t)
  assert.equal((await f.client.auth.getUser()).data.user.id, complete)
  const result = await f.render(noPlayer)
  assert.equal(result.charts[0].length, 1)
  assert.match(result.html, /Adversaire fictif 2/)
  assert.doesNotMatch(result.html, /Adversaire fictif 1|Adversaire fictif 3|Adversaire fictif 4/)
  assert.doesNotMatch(result.html, /edit-match|<form|Mes objectifs/)
})

test('historical season and manual career survive without a players identity and never inflate match totals', async t => {
  const f = await fixture(t)
  const previous = await f.render(noPlayer, '', { season: '2025-2026' })
  assert.equal(previous.cards.find(card => card.title === 'Total Buts').value, 2)
  assert.match(previous.html, /Adversaire fictif 3/)
  const manual = await f.render(noPlayer, '', { season: '1985-1986' })
  assert.ok(manual.cards.every(card => card.value === '—'))
  assert.match(manual.html, /<dd>22<\/dd>/)
  const career = await f.render(noPlayer, 'career/')
  assert.match(career.html, /Club historique fictif/)
  assert.match(career.html, /1985/)
})

test('a valid profile with no match displays an honest empty state rather than invented statistics', async t => {
  const f = await fixture(t), result = await f.render(empty)
  assert.ok(result.cards.every(card => card.value === '—'))
  assert.match(result.html, /Aucun match enregistré dans FootStats pour cette sélection/)
  assert.deepEqual(result.charts, [[]])
})

test('unknown match statistics stay unknown, with their real match retained', async t => {
  const f = await fixture(t), result = await f.render(unknown)
  assert.equal(result.cards.find(card => card.title === 'Matchs Joués').value, 1)
  for (const title of ['Total Buts', 'Passes décisives', 'Minutes jouées']) assert.equal(result.cards.find(card => card.title === title).value, '—')
  assert.equal(result.charts[0][0].goals, null)
  assert.equal(result.charts[0][0].assists, null)
  assert.match(result.html, /Adversaire fictif 4/)
})

test('current anonymous restrictions are preserved in the fixture; no profile access is invented', async t => {
  const f = await fixture(t, true)
  for (const table of ['profiles', 'matches', 'statistics']) assert.deepEqual((await f.client.from(table).select('*')).data, [])
  assert.ok((await f.client.from('career_entries').select('*')).data.length > 0, 'career SELECT is currently public')
  await assert.rejects(f.render(noPlayer), /NOT_FOUND/)
  await assert.rejects(renderServerPage('src/app/profile/[userId]/layout.tsx', { userId: noPlayer, client: f.client }), /NOT_FOUND/)
})

test('an absent identity remains a 404 while database errors remain technical failures', async t => {
  const f = await fixture(t)
  await assert.rejects(f.render('10000000-0000-4000-8000-000000000099'), /NOT_FOUND/)
  await assert.rejects(renderServerPage('src/app/profile/[userId]/page.tsx', { userId: noPlayer, profileError: { code: 'SYNTHETIC_FAILURE' } }), /Impossible|chargement/)
})
