// Local demo: node scripts/preview-seasons.mjs [port, default 3014] [seasons|records|review|goals]
// All fixture/Auth replacements are written outside the repository, never to app sources.
import { cpSync, mkdtempSync, chmodSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createSeasonDemoData, DEMO_PLAYER_ID } from '../tests/fixtures/season-demo.mjs'
import { createRecordDemoData } from '../tests/fixtures/record-demo.mjs'
import { createReviewDemoData } from '../tests/fixtures/review-demo.mjs'
import { createGoalsDemoData } from '../tests/fixtures/goals-demo.mjs'

if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Local development only')
const mode = process.argv[3] ?? 'seasons'
if (!['seasons', 'records', 'review', 'goals'].includes(mode)) throw new Error('Unknown local demo mode')
const port = Number(process.argv[2] ?? 3014)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port')
const root = fileURLToPath(new URL('../', import.meta.url))
const preview = mkdtempSync(join(tmpdir(), 'footstats-seasons-'))
chmodSync(preview, 0o700)
for (const path of ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs', 'postcss.config.mjs']) {
  cpSync(join(root, path), join(preview, path), { recursive: true, filter: source => !source.includes('/design-preview') && !source.split('/').at(-1).startsWith('.env') })
}
symlinkSync(join(root, 'node_modules'), join(preview, 'node_modules'), 'dir')
const monthParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: 'numeric' }).formatToParts(new Date())
const year = Number(monthParts.find(part => part.type === 'year').value) - (Number(monthParts.find(part => part.type === 'month').value) < 7 ? 1 : 0)
const fixturePath = join(preview, 'fixtures.json')
const createData = mode === 'goals' ? createGoalsDemoData : mode === 'review' ? createReviewDemoData : createRecordDemoData
const fixtures = mode !== 'seasons' ? {
  ...createData(year), scenarios: Object.fromEntries(['full', 'empty', 'short', 'unknown'].map(scenario => [scenario, createData(year, scenario)])),
} : createSeasonDemoData(year)
writeFileSync(fixturePath, JSON.stringify(fixtures), { mode: 0o600 })
unlinkSync(join(preview, 'src/utils/supabase/server.ts'))
writeFileSync(join(preview, 'src/utils/supabase/server.js'), readFileSync(join(root, 'tests/fixtures/season-demo-server.mjs'), 'utf8').replace('__FIXTURE_PATH__', fixturePath).replace('__ALLOW_GOAL_WRITES__', mode === 'goals' ? 'true' : 'false'))
// This header/scenario adapter exists ONLY in the disposable copy. The real proxy is untouched.
writeFileSync(join(preview, 'src/proxy.ts'), "import { NextResponse, type NextRequest } from 'next/server'\nexport function proxy(request: NextRequest) { const headers = new Headers(request.headers); const value = request.nextUrl.searchParams.get('demo') || 'full'; headers.set('x-footstats-demo-scenario', ['full','empty','short','unknown'].includes(value) ? value : 'full'); return NextResponse.next({request: {headers}}) }\n")
writeFileSync(join(preview, 'src/utils/getClubLogo.ts'), 'export function getClubLogo() { return null }\n')
const layoutPath = join(preview, 'src/app/layout.tsx')
const writeNotice = mode === 'goals' ? 'OBJECTIFS FICTIFS MODIFIABLES LOCALEMENT · AUTRES ÉCRITURES DÉSACTIVÉES' : 'ÉCRITURES DÉSACTIVÉES'
writeFileSync(layoutPath, readFileSync(layoutPath, 'utf8').replace('<StadiumLaunch />', `<div style={{position:"relative",zIndex:60,background:"#D5EA58",color:"#111820",textAlign:"center",padding:10,fontSize:12}}>DÉMONSTRATION LOCALE · JOUEUR ET DONNÉES FICTIFS · ${writeNotice}</div><StadiumLaunch />`))
console.log(`Private preview: ${preview}`)
console.log(`Dashboard: http://localhost:${port}/dashboard`)
console.log(`Public: http://localhost:${port}/profile/${DEMO_PLAYER_ID}`)
for (const start of [year, year - 1, year - 2, year - 3, year - 4, 1985]) console.log(`http://localhost:${port}/dashboard?season=${start}-${start + 1}`)
if (mode === 'records') for (const scenario of ['full', 'empty', 'short', 'unknown']) console.log(`http://localhost:${port}/dashboard/records?demo=${scenario}`)
if (mode === 'review') {
  for (const start of [year, year - 1, year - 2, year - 3, year - 4, year - 5, 1985]) console.log(`http://localhost:${port}/dashboard/season-review?season=${start}-${start + 1}`)
  console.log(`http://localhost:${port}/dashboard/season-review?season=${year}-${year + 1}&compare=${year - 1}-${year}`)
  console.log(`http://localhost:${port}/dashboard/season-review?season=${year}-${year + 1}&compare=${year - 3}-${year - 2}`)
  for (const scenario of ['empty', 'short', 'unknown']) console.log(`http://localhost:${port}/dashboard/season-review?season=${year}-${year + 1}&demo=${scenario}`)
}
if (mode === 'goals') {
  for (const start of [year, year - 1, year - 2, year - 3, year - 5, year - 6]) console.log(`http://localhost:${port}/dashboard/goals?season=${start}-${start + 1}`)
  for (const scenario of ['empty', 'short', 'unknown']) console.log(`http://localhost:${port}/dashboard/goals?season=${year}-${year + 1}&demo=${scenario}`)
}
const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '0.0.0.0', '--port', String(port)], {
  cwd: preview, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: tmpdir(), TMPDIR: tmpdir(), NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { process.exitCode = code ?? 0 })
