// Regenerate with: node scripts/generate-brand-icons.mjs
// Verify without writing: node scripts/generate-brand-icons.mjs --check
// Uses React/TypeScript already installed, and Next.js's existing sharp dependency.
// No network, environment variables, fonts, or production data are used.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = new URL('../', import.meta.url)
const compiled = ts.transpileModule(readFileSync(new URL('src/components/FootStatsMark.tsx', root), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} }
new vm.Script(compiled).runInNewContext({ module: loaded, exports: loaded.exports, require(name) {
  if (name === 'react/jsx-runtime') return require(name)
  throw new Error(`Unexpected mark dependency: ${name}`)
} })
const Mark = loaded.exports.default

function svg(size, mobile = false) {
  // The complete mobile mark fits inside the central 80%-diameter safe circle.
  // Favicons use slightly less padding for legibility at 16px.
  const markSize = size * (mobile ? 0.75 : 0.875)
  return renderToStaticMarkup(React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: `0 0 ${size} ${size}`,
  }, React.createElement('rect', { width: size, height: size, fill: '#111820' }),
  React.createElement(Mark, { x: (size - markSize) / 2, y: (size - markSize) / 2, width: markSize, height: markSize, stroke: '#D5EA58' })))
}

const png = (size, mobile = false) => sharp(Buffer.from(svg(size, mobile))).png().toBuffer()
const faviconSizes = [16, 32, 48]
const faviconPngs = await Promise.all(faviconSizes.map(size => png(size)))
// ICO directory with PNG frames (supported by modern browsers and Windows).
const directory = Buffer.alloc(6 + faviconSizes.length * 16)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(faviconSizes.length, 4)
let offset = directory.length
for (const [index, size] of faviconSizes.entries()) {
  const entry = 6 + index * 16
  directory[entry] = directory[entry + 1] = size
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(faviconPngs[index].length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += faviconPngs[index].length
}
const assets = new Map([
  ['src/app/favicon.ico', Buffer.concat([directory, ...faviconPngs])],
  ['src/app/icon.svg', Buffer.from(svg(32) + '\n')],
  ['src/app/apple-icon.png', await png(180, true)],
  ['public/icon-192x192.png', await png(192, true)],
  ['public/icon-512x512.png', await png(512, true)],
])
for (const [path, data] of assets) {
  if (process.argv.includes('--check')) {
    if (!readFileSync(new URL(path, root)).equals(data)) throw new Error(`Regenerate branding asset: ${path}`)
  } else writeFileSync(new URL(path, root), data)
}
console.log(`${assets.size} branding assets ${process.argv.includes('--check') ? 'verified' : 'generated'}.`)
