import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Compile source files only: never evaluate the fixture, clients, .env files,
// Auth, Server Actions or the cron. No fetch, socket or database is used.
const root = fileURLToPath(new URL('../', import.meta.url))
const fixture = fileURLToPath(new URL('./supabase-types.typecheck.ts', import.meta.url))
let program

function typecheckProgram() {
  if (program) return program
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')
  assert.ok(configPath, 'The application tsconfig must exist')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  assert.equal(config.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  assert.deepEqual(parsed.errors, [])
  program = ts.createProgram({
    rootNames: [fixture],
    options: { ...parsed.options, noEmit: true, incremental: false },
  })
  return program
}

test('actual Supabase clients infer rows, writes, RPC arguments and one-to-one joins', () => {
  const checked = typecheckProgram()
  const diagnostics = ts.getPreEmitDiagnostics(checked)
  const details = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: name => name,
    getNewLine: () => '\n',
  })
  assert.equal(diagnostics.length, 0, details)
  assert.equal(checked.getCompilerOptions().noEmit, true)
})

test('browser, server, proxy and cron instantiate clients with the complete Database schema', () => {
  const checked = typecheckProgram()
  for (const [relativePath, constructor] of [
    ['src/utils/supabase/client.ts', 'createBrowserClient'],
    ['src/utils/supabase/server.ts', 'createServerClient'],
    ['src/utils/supabase/proxy.ts', 'createServerClient'],
    ['src/app/api/cron/rbfa/route.ts', 'createClient'],
  ]) {
    const source = checked.getSourceFile(`${root}${relativePath}`)
    assert.ok(source, `${relativePath} must be part of the real compilation`)
    const calls = []
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === constructor) calls.push(node)
      ts.forEachChild(node, visit)
    }
    visit(source)
    assert.equal(calls.length, 1, relativePath)
    assert.equal(calls[0].typeArguments?.length, 1, relativePath)
    assert.equal(calls[0].typeArguments[0].getText(source), 'Database', relativePath)
  }
})
