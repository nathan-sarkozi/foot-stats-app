import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
export const cssModuleMock = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }

// Evaluate actual presentation code, with every external/data dependency explicit.
// The CSS mock keeps semantic class names for assertions; browser tests use real CSS.
export function loadUiModule(relativePath, mocks = {}, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8'), {
    fileName: relativePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const fileModule = { exports: {} }
  new vm.Script(compiled, { filename: relativePath }).runInContext(vm.createContext({
    module: fileModule, exports: fileModule.exports, console, ...globals,
    require(name) {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.module.css')) return cssModuleMock
      if (['react', 'react/jsx-runtime', 'framer-motion', 'recharts'].includes(name)) return require(name)
      throw new Error(`Unexpected UI dependency: ${name}`)
    },
  }))
  return fileModule.exports
}
