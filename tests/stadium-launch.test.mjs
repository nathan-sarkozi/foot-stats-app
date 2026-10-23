import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { loadUiModule } from './helpers/load-ui-module.mjs'

function harness(reduced = false) {
  const events = new Map(), animations = new Map(), mediaEvents = new Map(), effects = []
  const document = { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) }
  const media = { matches: reduced, addEventListener: (name, fn) => mediaEvents.set(name, fn), removeEventListener: name => mediaEvents.delete(name) }
  let refs, cursor
  const { StadiumLaunch } = loadUiModule('src/components/StadiumLaunch.tsx', {
    react: { ...React, useRef: value => refs[cursor++] ??= { current: value }, useEffect: fn => effects.push(fn) },
    './FootStatsMark': { __esModule: true, default: () => null },
  }, { document, window: { matchMedia: () => media }, WeakMap })
  const mount = (previousRefs = []) => {
    refs = previousRefs; cursor = 0; effects.length = 0
    const element = { hidden: false, addEventListener: (name, fn) => animations.set(name, fn), removeEventListener: name => animations.delete(name) }
    const tree = StadiumLaunch()
    tree.props.ref.current = element
    const effect = effects[0]
    return { element, refs, effect, cleanup: effect() }
  }
  return { mount, events, animations, media, mediaEvents }
}

test('first document intro remains available, then completes without a timer or application delay', () => {
  const view = harness(), first = view.mount()
  assert.equal(first.element.hidden, false)
  view.animations.get('animationend')({ target: {} })
  assert.equal(first.element.hidden, false, 'a child animation cannot end the parent intro')
  view.animations.get('animationend')({ target: first.element })
  assert.equal(first.element.hidden, true)
  first.cleanup()
  assert.equal(view.events.size, 0)
  assert.equal(view.animations.size, 0)
  assert.equal(view.mediaEvents.size, 0)
})

for (const event of ['focusin', 'pointerdown', 'keydown']) {
  test(`${event} dismisses the intro permanently for the current instance`, () => {
    const view = harness(), first = view.mount()
    view.events.get(event)()
    assert.equal(first.element.hidden, true)
    assert.equal(view.events.has('focusout'), false, 'losing focus must not re-enable the intro')
    first.cleanup()
  })
}

test('an actual remount in the same document cannot replay the intro', () => {
  const view = harness(), first = view.mount()
  first.cleanup()
  const next = view.mount()
  assert.equal(next.element.hidden, true)
  assert.equal(next.cleanup, undefined)
})

test('development effect replay on the same mounted instance does not suppress the initial intro', () => {
  const view = harness(), first = view.mount()
  first.cleanup()
  const cleanup = first.effect()
  assert.equal(first.element.hidden, false)
  cleanup()
})

test('reduced motion is honored initially and when the preference changes during the intro', () => {
  const reduced = harness(true), first = reduced.mount()
  assert.equal(first.element.hidden, true)
  first.cleanup()
  const view = harness(), second = view.mount()
  view.media.matches = true; view.mediaEvents.get('change')()
  assert.equal(second.element.hidden, true)
  view.media.matches = false; view.mediaEvents.get('change')()
  assert.equal(second.element.hidden, true, 'removing reduced motion cannot replay an intro')
  second.cleanup()
})

test('focus-dependent CSS animation removal is absent; loading and page animations stay intact', () => {
  const css = readFileSync(new URL('../src/components/stadium-motion.module.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /\.launch:has\([^}]*focus-within/)
  assert.match(css, /\.launch\[hidden\] \{ display: none; animation: none;/)
  assert.match(css, /animation: launchAway 1s/)
  assert.match(css, /animation: loadingPulse/)
  assert.match(css, /prefers-reduced-motion: no-preference/)
})
