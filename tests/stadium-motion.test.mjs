import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'

const motion = loadUiModule('src/components/StadiumMotion.tsx')
const render = Component => renderToStaticMarkup(React.createElement(Component))

test('document signature is decorative and cannot capture focus or announce false loading', () => {
  const html = render(motion.StadiumLaunch)
  assert.match(html, /^<div[^>]+aria-hidden="true"[^>]+data-stadium-launch=""/)
  assert.match(html, /footstats/)
  assert.doesNotMatch(html, /<(a|button|input)|tabindex|role=|aria-live|progressbar|Chargement/)
})

test('route loading announces one real waiting state with decorative skeletons', () => {
  const html = render(motion.StadiumLoading)
  assert.equal((html.match(/role="status"/g) || []).length, 1)
  assert.match(html, /aria-live="polite" aria-busy="true"/)
  assert.match(html, /Chargement de ton espace FootStats…/)
  assert.match(html, /class="skeleton" aria-hidden="true"/)
  assert.doesNotMatch(html, /<button|<a |<input|data-stadium-launch|0 but|0 min/)
})

for (const path of ['dashboard', 'profile/[userId]']) {
  test(`${path}: loading fallback neither replays the intro nor exposes statistics`, () => {
    const Loading = loadUiModule(`src/app/${path}/loading.tsx`, { '@/components/StadiumMotion': motion }).default
    assert.equal(render(Loading), render(motion.StadiumLoading))
  })
}
