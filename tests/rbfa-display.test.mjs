import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as rbfaDate from '../src/utils/rbfaDate.ts'

// Every query is replaced explicitly. No environment, credentials, database,
// ScraperAPI or live RBFA request is used by these display/read regressions.
const require = createRequire(import.meta.url)
const now = Date.parse('2026-10-19T12:00:00Z')
const upcomingMatch = changes => ({
  homeTeam: { name: 'Synthetic home', logo: null },
  awayTeam: { name: 'Synthetic away', logo: null },
  series: { name: 'Synthetic league' },
  startTime: '2026-10-25T14:00:00Z',
  ...changes,
})
const rankings = changes => ({
  teams: [{ teamId: '368465', name: 'Synthetic team', logo: null,
    position: 1, points: 12, matchesPlayed: 4, goalDifference: 5, ...changes }],
})

function loadModule(path, mocks, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText
  const sourceModule = { exports: {} }
  new vm.Script(compiled, { filename: path }).runInContext(vm.createContext({
    module: sourceModule, exports: sourceModule.exports,
    console: { error() {} }, AbortSignal, ...globals,
    require(name) {
      if (name in mocks) return mocks[name]
      if (name === 'zod' || name === 'react/jsx-runtime') return require(name)
      throw new Error(`Unexpected RBFA display dependency: ${name}`)
    },
  }))
  return sourceModule.exports
}

const contracts = loadModule('src/utils/rbfa-contracts.ts', { './rbfaDate': rbfaDate })

function cache(options = {}) {
  const calls = { queries: [], logs: [], clients: 0 }
  const row = options.row === undefined ? { upcoming_match: upcomingMatch(), rankings: rankings() } : options.row
  const client = {
    from(table) {
      const query = { table }
      calls.queries.push(query)
      const builder = {
        select(value) { query.select = value; return builder },
        eq(name, value) { query.filter = [name, value]; return builder },
        abortSignal(signal) { query.signal = signal; return builder },
        async maybeSingle() {
          query.single = 'maybeSingle'
          if (options.throwQuery) throw new Error('PRIVATE_CREDENTIAL_MUST_NOT_BE_LOGGED')
          if (options.timeout) {
            await new Promise(resolve => {
              if (query.signal.aborted) resolve()
              else query.signal.addEventListener('abort', resolve, { once: true })
            })
            return { data: null, error: { code: '', message: 'PRIVATE_CREDENTIAL_MUST_NOT_BE_LOGGED' } }
          }
          return { data: row, error: options.error ?? null }
        },
      }
      return builder
    },
  }
  const service = loadModule('src/services/rbfa.ts', {
    '@/utils/supabase/server': { createClient: async () => { calls.clients++; return client } },
    '@/utils/rbfa-contracts': contracts,
    '@/utils/rbfaDate': rbfaDate,
  }, {
    console: { error(...args) { calls.logs.push(args) } },
    ...(options.timeout ? { AbortSignal: { timeout(ms) {
      assert.equal(ms, 5_000)
      return AbortSignal.timeout(1)
    } } } : {}),
  })
  return { service, calls, row, read: teamId => service.getTeamRbfaData(teamId ?? '368465', now) }
}

async function widget(data, props = { teamId: '368465', isDashboard: true }) {
  const calls = []
  const component = value => ({ __esModule: true, default: value })
  const loaded = loadModule('src/app/dashboard/components/TeamWidget.tsx', {
    '@/services/rbfa': { getTeamRbfaData: async teamId => { calls.push(teamId); return data } },
    '@/utils/rbfaDate': rbfaDate,
    'next/link': component(({ children, ...props }) => React.createElement('a', props, children)),
    'next/image': component(({ src, alt }) => React.createElement('img', { src, alt })),
  })
  return { html: renderToStaticMarkup(await loaded.default(props)), calls }
}

test('RBFA timestamp parsing preserves equivalent explicit instants', () => {
  const expected = Date.parse('2026-10-25T14:00:00Z')
  assert.equal(rbfaDate.parseRbfaStartTime('2026-10-25T14:00:00Z'), expected)
  assert.equal(rbfaDate.parseRbfaStartTime('2026-10-25T15:00:00+01:00'), expected)
  assert.equal(rbfaDate.parseRbfaStartTime('2026-10-25T10:00:00-04:00'), expected)
  assert.equal(rbfaDate.parseRbfaStartTime('2026-10-25T14:00Z'), expected)
})

test('invalid or impossible timestamps are rejected regardless of whether an offset is present', () => {
  for (const value of [null, undefined, 0, {}, 'invalid', '2026-10-25',
    '2026-02-30T12:00:00', '2026-02-30T12:00:00Z', '2026-00-19T12:00:00Z',
    '2026-10-00T12:00:00Z', '2026-10-19T24:00:00Z', '2026-10-19T12:60:00Z',
    '2026-10-19T12:00:60Z', '2026-10-19T12:00:00+25:00', '2026-10-19T12:00:00+01:60']) {
    assert.equal(rbfaDate.parseRbfaStartTime(value), null, String(value))
    assert.equal(rbfaDate.isValidRbfaStartTime(value), false)
    assert.equal(rbfaDate.formatRbfaKickoff(value), null)
  }
  assert.notEqual(rbfaDate.parseRbfaStartTime('2024-02-29T12:00:00Z'), null)
})

test('historical ISO dates remain valid calendar values without inventing an absolute instant', () => {
  for (const value of ['2026-01-25T14:30', '2026-07-25T14:30:00.123456789']) {
    assert.equal(rbfaDate.isValidRbfaStartTime(value), true)
    assert.equal(rbfaDate.parseRbfaStartTime(value), null)
    assert.equal(rbfaDate.formatRbfaKickoff(value).time, '14:30')
    assert.match(rbfaDate.formatRbfaKickoff(value).warning, /Fuseau horaire à confirmer/)
  }
})

test('offset-free Belgian DST gap and repeated-hour values stay explicitly unresolved', () => {
  for (const [value, date] of [
    ['2026-03-29T02:30:00', 'dimanche 29 mars'],
    ['2026-10-25T02:30:00', 'dimanche 25 octobre'],
  ]) {
    assert.equal(rbfaDate.isValidRbfaStartTime(value), true)
    assert.equal(rbfaDate.parseRbfaStartTime(value), null)
    assert.deepEqual(rbfaDate.formatRbfaKickoff(value), {
      date, time: '02:30', warning: 'Fuseau horaire à confirmer.',
    })
  }
})

test('historical date handling never depends on the execution host timezone', () => {
  const moduleUrl = new URL('../src/utils/rbfaDate.ts', import.meta.url).href
  const code = `import * as date from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify({
      raw: date.formatRbfaKickoff('2026-07-25T14:30:00'),
      ambiguous: date.parseRbfaStartTime('2026-10-25T02:30:00'),
      nonexistent: date.parseRbfaStartTime('2026-03-29T02:30:00'),
      absolute: date.parseRbfaStartTime('2026-10-25T02:30:00+01:00')
    }));`
  const results = ['UTC', 'Europe/Brussels', 'America/New_York'].map(TZ =>
    JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      env: { PATH: process.env.PATH, TZ }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })))
  assert.deepEqual(results[0], results[1])
  assert.deepEqual(results[0], results[2])
  assert.equal(results[0].raw.time, '14:30')
  assert.equal(results[0].ambiguous, null)
  assert.equal(results[0].nonexistent, null)
  assert.equal(results[0].absolute, Date.parse('2026-10-25T01:30:00Z'))
})

test('kickoff formatting uses Brussels in winter and summer including a local day change', () => {
  assert.equal(rbfaDate.formatRbfaKickoff('2026-01-20T18:00:00Z').time, '19:00')
  assert.equal(rbfaDate.formatRbfaKickoff('2026-07-20T18:00:00Z').time, '20:00')
  assert.deepEqual(rbfaDate.formatRbfaKickoff('2026-07-20T23:30:00Z'), {
    date: 'mardi 21 juillet', time: '01:30',
  })
})

test('Belgian spring DST skips the nonexistent hour', () => {
  assert.equal(rbfaDate.formatRbfaKickoff('2026-03-29T00:30:00Z').time, '01:30')
  assert.equal(rbfaDate.formatRbfaKickoff('2026-03-29T01:30:00Z').time, '03:30')
})

test('Belgian autumn DST renders both absolute occurrences of the repeated hour correctly', () => {
  const first = '2026-10-25T02:30:00+02:00'
  const second = '2026-10-25T02:30:00+01:00'
  assert.equal(rbfaDate.parseRbfaStartTime(second) - rbfaDate.parseRbfaStartTime(first), 3_600_000)
  assert.equal(rbfaDate.formatRbfaKickoff(first).time, '02:30')
  assert.equal(rbfaDate.formatRbfaKickoff(second).time, '02:30')
})

test('cache reads combine both fields with a deadline and no write operation', async () => {
  const harness = cache()
  const result = await harness.read()
  assert.equal(result.upcoming.status, 'scheduled')
  assert.equal(result.upcoming.match.homeTeam.name, 'Synthetic home')
  assert.equal(result.rankings.teams.length, 1)
  assert.equal(harness.calls.queries.length, 1)
  const query = harness.calls.queries[0]
  assert.equal(query.table, 'rbfa_cache')
  assert.equal(query.select, 'upcoming_match, rankings')
  assert.deepEqual(query.filter, ['team_id', '368465'])
  assert.equal(query.single, 'maybeSingle')
  assert.ok(query.signal instanceof AbortSignal)
})

test('an explicitly empty upcoming match is distinct from an unavailable cache', async () => {
  const harness = cache({ row: { upcoming_match: null, rankings: null } })
  assert.equal((await harness.read()).upcoming.status, 'none')
  const html = (await widget(await harness.read())).html
  assert.match(html, /Aucun match planifié/)
  assert.doesNotMatch(html, /Service RBFA temporairement indisponible/)
})

test('past or already started matches are hidden without deleting or changing cached JSON', async () => {
  for (const startTime of ['2026-10-18T12:00:00Z', '2026-10-19T12:00:00Z']) {
    const harness = cache({ row: { upcoming_match: upcomingMatch({ startTime }), rankings: rankings() } })
    const before = JSON.stringify(harness.row)
    const data = await harness.read()
    assert.equal(data.upcoming.status, 'stale')
    assert.equal(data.upcoming.match, null)
    assert.equal(JSON.stringify(harness.row), before)
    const html = (await widget(data)).html
    assert.match(html, /Prochain match temporairement indisponible/)
    assert.doesNotMatch(html, /Aucun match planifié|Synthetic home/)
    assert.match(html, /Synthetic team/)
  }
})

test('a valid fixture with unknown kickoff keeps the existing date-to-be-determined state', async () => {
  const data = await cache({ row: { upcoming_match: upcomingMatch({ startTime: null }), rankings: null } }).read()
  assert.equal(data.upcoming.status, 'scheduled')
  const html = (await widget(data)).html
  assert.match(html, /Synthetic home|Synthetic away/)
  assert.match(html, /Date à déterminer/)
  assert.match(html, /--:--/)
})

test('historical cache dates remain visible with a timezone warning and no cache mutation', async () => {
  for (const startTime of ['2026-10-18T14:30:00', '2026-10-25T14:30:00',
    '2026-03-29T02:30:00', '2026-10-25T02:30:00']) {
    const harness = cache({ row: { upcoming_match: upcomingMatch({ startTime }), rankings: rankings() } })
    const before = JSON.stringify(harness.row)
    const data = await harness.read()
    assert.equal(data.upcoming.status, 'unresolved')
    assert.equal(data.upcoming.match.startTime, startTime)
    assert.equal(JSON.stringify(harness.row), before)
    const html = (await widget(data)).html
    assert.match(html, /Synthetic home/)
    assert.match(html, /Fuseau horaire à confirmer/)
    assert.match(html, /role="status"/)
    assert.doesNotMatch(html, /Date à déterminer|Prochain match temporairement indisponible/)
  }
})

test('malformed upcoming JSON does not crash the widget or conceal valid rankings', async () => {
  for (const match of [{}, { homeTeam: null }, upcomingMatch({ startTime: '2026-02-30T15:00:00' })]) {
    const data = await cache({ row: { upcoming_match: match, rankings: rankings() } }).read()
    assert.equal(data.upcoming.status, 'unavailable')
    const html = (await widget(data)).html
    assert.match(html, /Prochain match temporairement indisponible/)
    assert.match(html, /Synthetic team/)
    assert.doesNotMatch(html, /Aucun match planifié/)
  }
})

test('malformed rankings do not conceal a valid upcoming match', async () => {
  const data = await cache({ row: { upcoming_match: upcomingMatch(), rankings: { teams: [{}] } } }).read()
  assert.equal(data.upcoming.status, 'scheduled')
  assert.equal(data.rankings, null)
  const html = (await widget(data)).html
  assert.match(html, /Synthetic home/)
  assert.match(html, /Classement non disponible actuellement/)
})

test('absent cache rows and absent fields mean unavailable rather than no scheduled match', async () => {
  for (const row of [null, {}]) {
    const data = await cache({ row }).read()
    assert.equal(data.upcoming.status, 'unavailable')
    assert.equal(data.rankings, null)
    const html = (await widget(data)).html
    assert.match(html, /Service RBFA temporairement indisponible/)
    assert.doesNotMatch(html, /Aucun match planifié/)
  }
})

test('database errors are unavailable and logs exclude backend text and credentials', async () => {
  for (const error of [{ code: '42501', message: 'PRIVATE_CREDENTIAL_MUST_NOT_BE_LOGGED' },
    { code: 'https://private.invalid/SECRET', message: 'PRIVATE_CREDENTIAL_MUST_NOT_BE_LOGGED' }]) {
    const harness = cache({ error })
    const data = await harness.read()
    assert.equal(data.upcoming.status, 'unavailable')
    assert.equal(data.rankings, null)
    assert.equal(harness.calls.logs.length, 1)
    assert.doesNotMatch(JSON.stringify(harness.calls.logs), /PRIVATE|private|SECRET/)
    assert.doesNotMatch((await widget(data)).html, /Aucun match planifié|PRIVATE|42501/)
  }
})

test('unexpected cache failures use only a safe diagnostic code', async () => {
  const harness = cache({ throwQuery: true })
  assert.equal((await harness.read()).upcoming.status, 'unavailable')
  assert.match(JSON.stringify(harness.calls.logs), /CACHE_READ_ERROR/)
  assert.doesNotMatch(JSON.stringify(harness.calls.logs), /PRIVATE/)
})

test('a slow cache query is aborted and remains unavailable rather than becoming empty', async () => {
  const harness = cache({ timeout: true })
  // Node timeout signals are unref'd; keep this purely simulated query alive.
  const keepAlive = setTimeout(() => {}, 100)
  try {
    assert.equal((await harness.read()).upcoming.status, 'unavailable')
    assert.equal(harness.calls.queries[0].signal.aborted, true)
  } finally {
    clearTimeout(keepAlive)
  }
})

test('no linked team preserves the dashboard prompt and keeps public profiles empty', async () => {
  const harness = cache()
  assert.equal((await harness.read('')).upcoming.status, 'unavailable')
  assert.equal(harness.calls.clients, 0)
  const prompt = await widget(null, { teamId: null, isDashboard: true })
  assert.match(prompt.html, /Connecte ton équipe RBFA/)
  assert.equal(prompt.calls.length, 0)
  const publicProfile = await widget(null, { teamId: null })
  assert.equal(publicProfile.html, '')
  assert.equal(publicProfile.calls.length, 0)
})

test('scheduled widget output uses Brussels and preserves historical numeric ranking strings', async () => {
  const harness = cache({ row: { upcoming_match: upcomingMatch({ startTime: '2026-07-20T23:30:00Z' }),
    rankings: rankings({ teamId: 368465, position: '1', points: '12', matchesPlayed: '4', goalDifference: '5' }) } })
  const data = await harness.service.getTeamRbfaData('368465', Date.parse('2026-07-19T12:00:00Z'))
  const html = (await widget(data)).html
  assert.match(html, /mardi 21 juillet/)
  assert.match(html, /01:30/)
  assert.match(html, /\+5/)
  assert.match(html, /text-indigo-900/)
})

test('an unavailable public widget stays absent while confirmed no-fixture data remains visible', async () => {
  const unavailable = await widget({ upcoming: { status: 'unavailable', match: null }, rankings: null }, { teamId: '368465' })
  assert.equal(unavailable.html, '')
  const none = await widget({ upcoming: { status: 'none', match: null }, rankings: null }, { teamId: '368465' })
  assert.match(none.html, /Aucun match planifié/)
})
