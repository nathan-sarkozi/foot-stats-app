// Local, read-only demo: node scripts/preview-seasons.mjs [port, default 3014]
// All fixture/Auth replacements are written outside the repository, never to app sources.
import { cpSync, mkdtempSync, chmodSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createSeasonDemoData, DEMO_PLAYER_ID } from '../tests/fixtures/season-demo.mjs'

if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Local development only')
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
writeFileSync(fixturePath, JSON.stringify(createSeasonDemoData(year)), { mode: 0o600 })
unlinkSync(join(preview, 'src/utils/supabase/server.ts'))
writeFileSync(join(preview, 'src/utils/supabase/server.js'), readFileSync(join(root, 'tests/fixtures/season-demo-server.mjs'), 'utf8').replace('__FIXTURE_PATH__', fixturePath))
writeFileSync(join(preview, 'src/proxy.ts'), "import { NextResponse } from 'next/server'\nexport function proxy() { return NextResponse.next() }\n")
writeFileSync(join(preview, 'src/utils/getClubLogo.ts'), 'export function getClubLogo() { return null }\n')
const layoutPath = join(preview, 'src/app/layout.tsx')
writeFileSync(layoutPath, readFileSync(layoutPath, 'utf8').replace('<StadiumLaunch />', '<div style={{background:"#D5EA58",color:"#111820",textAlign:"center",padding:10,fontSize:12}}>DÉMONSTRATION LOCALE · JOUEUR ET DONNÉES FICTIFS · ÉCRITURES DÉSACTIVÉES</div><StadiumLaunch />'))
console.log(`Private preview: ${preview}`)
console.log(`Dashboard: http://localhost:${port}/dashboard`)
console.log(`Public: http://localhost:${port}/profile/${DEMO_PLAYER_ID}`)
for (const start of [year, year - 1, year - 2, year - 3, year - 4, 1985]) console.log(`http://localhost:${port}/dashboard?season=${start}-${start + 1}`)
const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '0.0.0.0', '--port', String(port)], {
  cwd: preview, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: tmpdir(), TMPDIR: tmpdir(), NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { process.exitCode = code ?? 0 })
