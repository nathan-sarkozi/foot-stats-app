import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as competitions from '../src/utils/competitionFilters.ts'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import { renderServerPage } from './helpers/render-server-page.mjs'

// Real navigation code, fake browser and authenticated page fixtures only.
const model = loadUiModule('src/utils/navigation.ts', { './competitionFilters': competitions }, { URLSearchParams })
const component = value => ({ __esModule: true, default: value })
const icon = loadUiModule('src/app/dashboard/components/NavigationIcon.tsx').default
const link = component(({ children, ...props }) => React.createElement('a', props, children))
const scope = { currentYear: 2026, seasonYear: 2025, seasonYears: [2026, 2025, 1985], availableCompetitions: ['LEAGUE', 'CUP'], filteredCompetitions: ['CUP'], comparisonYear: 1985 }
const owner = 'synthetic-player'
const elements = (node, type) => !node || typeof node !== 'object' ? [] : [...((node.type === type || type === 'a' && node.type === link.default) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => elements(child, type))]

test('season links preserve validated history, scope competitions and isolate the comparison', () => {
  const links = model.buildNavigationLinks(scope, owner)
  assert.equal(links.dashboard, '/dashboard?season=2025-2026&comps=CUP')
  assert.equal(links.review, '/dashboard/season-review?season=2025-2026&comps=CUP&compare=1985-1986')
  assert.equal(links.goals, '/dashboard/goals?season=2025-2026')
  assert.equal(links.records, '/dashboard/records?comps=CUP')
  assert.equal(links.history, `${links.dashboard}#match-history`)
  assert.equal(links.profile, '/profile/synthetic-player')
})

test('a default seasonal competition scope does not accidentally filter multisaison records', () => {
  const links = model.buildNavigationLinks({ ...scope, filteredCompetitions: undefined }, owner)
  assert.equal(links.records, '/dashboard/records')
  assert.equal(links.dashboard, '/dashboard?season=2025-2026')
})

test('a records filter unavailable in the current season never produces an empty season filter', () => {
  const links = model.buildNavigationLinks({ ...scope, seasonYear: undefined, filteredCompetitions: ['CUP'], availableCompetitions: ['LEAGUE'] }, owner)
  assert.equal(links.dashboard, '/dashboard?season=2026-2027')
  assert.equal(links.records, '/dashboard/records?comps=CUP')
})

test('goal-only seasons remain private while known manual career seasons stay navigable', () => {
  const links = model.buildNavigationLinks({ ...scope, seasonYear: 2027, seasonYears: [2027, 2026, 1985], regularSeasonYears: [2026, 1985] }, owner)
  assert.equal(links.goals, '/dashboard/goals?season=2027-2028')
  assert.equal(new URL(links.dashboard, 'https://local.invalid').searchParams.get('season'), '2026-2027')
  assert.equal(new URL(links.review, 'https://local.invalid').searchParams.get('season'), '2026-2027')
  assert.equal(model.buildNavigationLinks({ ...scope, seasonYear: 1985 }, owner).goals, '/dashboard/goals?season=1985-1986')
})

test('invalid seasons, self comparisons, invalid competition values and foreign query values are not propagated', () => {
  const links = model.buildNavigationLinks({ ...scope, seasonYear: 99999, comparisonYear: 2026, filteredCompetitions: ['INVALID'] }, 'a/b')
  assert.equal(links.dashboard, '/dashboard?season=2026-2027')
  assert.equal(links.review, '/dashboard/season-review?season=2026-2027')
  assert.equal(links.profile, '/profile/a%2Fb')
  const key = model.navigationSourceKey('/dashboard/goals', { season: ['2025-2026'], comps: 'CUP', demo: 'full' })
  assert.equal(key, model.navigationSourceKey('/dashboard/goals', { season: '2025-2026' }))
  assert.notEqual(key, model.navigationSourceKey('/dashboard/goals', { season: ['2025-2026', '2026-2027'] }))
  assert.equal(model.navigationSourceKey('/dashboard/records', { season: '1985-1986' }), model.navigationSourceKey('/dashboard/records', {}))
})

test('direct links and child pages activate only the intended performance destination', () => {
  for (const [path, active] of [['/dashboard', 'dashboard'], ['/dashboard/add-match', 'dashboard'], ['/dashboard/edit-match/id', 'dashboard'], ['/dashboard/records', 'records'], ['/dashboard/season-review', 'review'], ['/dashboard/goals', 'goals'], ['/dashboard/career/edit/id', null], ['/login', null], ['/profile/id', null]]) {
    assert.equal(model.activePerformance(path), active)
  }
  assert.equal(model.isDestinationActive('career', '/dashboard/career/edit/id', owner), true)
  assert.equal(model.isDestinationActive('profile', `/profile/${owner}/career`, owner), true)
})

test('desktop performance navigation has four destinations and publishes exactly the validated scope', () => {
  let registration
  const effects = []
  const Nav = loadUiModule('src/app/dashboard/components/PerformanceNavigation.tsx', {
    react: { ...React, useEffect: fn => effects.push(fn) }, 'next/link': link,
    'next/navigation': { usePathname: () => '/dashboard/season-review' },
    '@/utils/navigation': model, './NavigationIcon': component(icon),
    './NavigationProvider': { useNavigationRegistration: () => (key, value) => { registration = { key, value }; return () => { registration = null } } },
  }).default
  const tree = Nav({ userId: owner, sourceKey: 'validated-key', scope })
  assert.equal(elements(tree, 'a').length, 4)
  const html = renderToStaticMarkup(tree)
  assert.match(html, /aria-label="Mes performances"/)
  assert.match(html, /data-navigation="review"/)
  assert.equal(elements(tree, 'a').filter(node => node.props['aria-current']).length, 1)
  const cleanup = effects[0]()
  assert.equal(registration.key, 'validated-key')
  assert.equal(registration.value, scope)
  cleanup()
  assert.equal(registration, null)
})

function mobile(path = '/dashboard/goals') {
  const effects = [], listeners = new Map(), mediaListeners = new Map(), states = []
  const original = { position: 'relative', overflow: '', top: '', left: '', right: '', width: '' }
  const body = { style: { ...original } }
  let focused, scrollY = 275
  const document = { body, documentElement: { style: { scrollBehavior: 'smooth' } }, querySelector: () => ({ focus() { focused = 'header' } }) }
  const media = { matches: false, addEventListener: (key, fn) => mediaListeners.set(key, fn), removeEventListener: key => mediaListeners.delete(key) }
  const window = { get scrollY() { return scrollY }, scrollTo(x, y) { scrollY = y }, matchMedia: () => media, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  const logout = async () => {}
  const Nav = loadUiModule('src/app/dashboard/components/MobileNavigation.tsx', {
    react: { ...React, useEffect: fn => effects.push(fn), useId: () => 'synthetic-dialog', useRef: value => ({ current: value }), useState: value => [value, next => states.push(next)], useCallback: fn => fn },
    'next/link': link, 'next/navigation': { usePathname: () => path }, '@/utils/navigation': model,
    './NavigationProvider': { useNavigationScope: () => scope }, './NavigationIcon': component(icon),
    './useSoftKeyboard': component(() => false), './logoutAction': { logout },
  }, { window, document }).default
  const tree = Nav({ userId: owner })
  const dialogNode = elements(tree, 'dialog')[0]
  const dialog = { open: false, showModal() { this.open = true }, close() { this.open = false; dialogNode.props.onClose() }, getBoundingClientRect: () => ({ left: 0, right: 390, top: 200, bottom: 850 }) }
  dialogNode.props.ref.current = dialog
  const trigger = elements(tree, 'button').find(node => node.props['data-navigation'] === 'more')
  trigger.props.ref.current = { focus() { focused = 'trigger' } }
  return { tree, dialogNode, dialog, trigger, effects, listeners, media, mediaListeners, states, document, original, window, logout, get focused() { return focused } }
}

test('mobile has exactly five bottom destinations, grouped secondary links and the unchanged logout action', () => {
  const view = mobile()
  const bottom = elements(view.tree, 'nav').find(node => node.props['aria-label'] === 'Navigation mobile')
  assert.equal(elements(bottom, 'a').length, 4)
  assert.equal(elements(bottom, 'button').length, 1)
  assert.deepEqual(elements(bottom, 'a').map(node => node.props['data-navigation']), ['dashboard', 'records', 'review', 'goals'])
  assert.equal(elements(bottom, 'a').find(node => node.props['aria-current']).props['data-navigation'], 'goals')
  const html = renderToStaticMarkup(view.tree)
  for (const label of ['Historique des matchs', 'Ma carrière', 'Communauté', 'Mon profil public', 'Paramètres', 'Déconnexion', 'Ajouter un match']) assert.ok(html.includes(label))
  assert.equal(elements(view.tree, 'form')[0].props.action, view.logout)
  assert.equal(view.trigger.props['aria-haspopup'], 'dialog')
})

test('native modal locks body scroll, restores styles, scroll and focus on Escape or outside close', () => {
  const view = mobile()
  const cleanup = view.effects[0]()
  view.trigger.props.onClick()
  assert.equal(view.dialog.open, true)
  assert.equal(view.document.body.style.position, 'fixed')
  assert.equal(view.document.body.style.top, '-275px')
  let prevented = false
  view.dialogNode.props.onCancel({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(view.dialog.open, false)
  assert.deepEqual(view.document.body.style, view.original)
  assert.equal(view.window.scrollY, 275)
  assert.equal(view.focused, 'trigger')
  view.trigger.props.onClick()
  view.dialogNode.props.onClick({ target: view.dialog, currentTarget: view.dialog, clientX: 100, clientY: 150 })
  assert.equal(view.dialog.open, false)
  assert.equal(view.focused, 'trigger')
  cleanup()
  assert.equal(view.listeners.size, 0)
  assert.equal(view.mediaListeners.size, 0)
})

test('drawer releases its scroll lock on link navigation, browser history, desktop resize and unmount', () => {
  for (const method of ['link', 'history', 'desktop', 'unmount', 'pathname']) {
    const view = mobile()
    const cleanup = view.effects[0]()
    view.trigger.props.onClick()
    if (method === 'link') elements(view.tree, 'a').find(node => node.props.href === '/dashboard/career').props.onClick()
    if (method === 'history') view.listeners.get('popstate')()
    if (method === 'desktop') { view.media.matches = true; view.mediaListeners.get('change')() }
    if (method === 'unmount') cleanup()
    if (method === 'pathname') view.effects[1]()
    assert.deepEqual(view.document.body.style, view.original, method)
    if (method === 'desktop') assert.equal(view.focused, 'header')
    if (method !== 'unmount') cleanup()
  }
})

test('keyboard detection ignores browser chrome and noneditable controls, hides only for a reduced editable viewport', () => {
  const effects = [], updates = [], listeners = new Map(), viewportListeners = new Map()
  class Element { tagName = 'DIV'; isContentEditable = false }
  class Input extends Element { tagName = 'INPUT'; type = 'text' }
  const viewport = { height: 850, addEventListener: (key, fn) => viewportListeners.set(key, fn), removeEventListener: key => viewportListeners.delete(key) }
  const document = { activeElement: new Element(), addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  const window = { innerHeight: 850, visualViewport: viewport, addEventListener() {}, removeEventListener() {} }
  const hook = loadUiModule('src/app/dashboard/components/useSoftKeyboard.ts', {
    react: { useState: value => [value, next => updates.push(next)], useEffect: fn => effects.push(fn) },
  }, { window, document, HTMLElement: Element, HTMLInputElement: Input }).default
  assert.equal(hook(), false)
  const cleanup = effects[0]()
  viewport.height = 700; viewportListeners.get('resize')(); assert.equal(updates.at(-1), false)
  document.activeElement = new Input(); listeners.get('focusin')(); assert.equal(updates.at(-1), false)
  viewport.height = 500; viewportListeners.get('resize')(); assert.equal(updates.at(-1), true)
  document.activeElement.type = 'checkbox'; listeners.get('focusin')(); assert.equal(updates.at(-1), false)
  document.activeElement.type = 'text'; viewport.height = 850; viewportListeners.get('resize')(); assert.equal(updates.at(-1), false)
  cleanup(); assert.equal(viewportListeners.size, 0); assert.equal(listeners.size, 0)
})

test('dashboard publishes its existing validated historical scope without adding data queries', async () => {
  const result = await renderServerPage('src/app/dashboard/page.tsx', {
    matches: [{ id: 'synthetic', player_id: owner, match_date: '1985-07-01', opponent: 'Synthetic', competition_type: 'LEAGUE', statistics: [] }],
    searchParams: { season: '1985-1986', comps: ['LEAGUE', 'INVALID'] },
  })
  const nav = result.widgets.find(widget => widget.name === 'PerformanceNavigation').props
  assert.equal(nav.scope.seasonYear, 1985)
  assert.ok(nav.scope.seasonYears.includes(1985))
  assert.equal(model.buildNavigationLinks(nav.scope, owner).goals, '/dashboard/goals?season=1985-1986')
  assert.deepEqual(result.queries.map(query => query.table), ['profiles', 'matches', 'career_entries', 'statistics'])
})

test('private tabs are hidden on mobile, safe-area spacing and reduced motion are scoped to navigation', () => {
  const css = readFileSync(new URL('../src/app/dashboard/components/navigation.module.css', import.meta.url), 'utf8')
  assert.match(css, /@media \(max-width: 1023px\)/)
  assert.match(css, /\.desktopLinks, \.account, \.performanceTabs \{ display: none/)
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/)
  assert.match(css, /padding-bottom: calc\(90px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('scope registration rejects stale routes and late cleanup cannot remove a newer selection', () => {
  let pathname = '/dashboard', params = new URLSearchParams('season=2025-2026'), state = null, reducer
  const Provider = loadUiModule('src/app/dashboard/components/NavigationProvider.tsx', {
    react: { ...React, useReducer: fn => { reducer = fn; return [state, action => { state = fn(state, action) }] }, useCallback: fn => fn, useMemo: fn => fn() },
    'next/navigation': { usePathname: () => pathname, useSearchParams: () => params }, '@/utils/navigation': model,
  }).default
  const render = () => Provider({ currentYear: 2026, children: null })
  const value = tree => tree.props.children.props.value
  let tree = render()
  assert.equal(value(tree).seasonYear, undefined)
  const key = model.navigationSourceKey(pathname, { season: '2025-2026' })
  const unregister = tree.props.value(key, scope)
  tree = render(); assert.equal(value(tree), scope)
  const newScope = { ...scope, seasonYear: 1985 }
  params = new URLSearchParams('season=1985-1986')
  assert.equal(value(render()).seasonYear, undefined, 'pending navigation cannot reuse a stale selection')
  tree.props.value(model.navigationSourceKey(pathname, { season: '1985-1986' }), newScope)
  unregister()
  assert.equal(value(render()), newScope, 'late old-page cleanup preserves the new registration')
  pathname = '/dashboard/settings'
  assert.equal(value(render()).seasonYear, undefined, 'unrelated pages cannot inherit private filters')
  assert.equal(reducer(state, { type: 'unregister', token: {} }), state)
})

test('demo activation lives only in a disposable copy and production app sources contain no fixture hooks', () => {
  const script = readFileSync(new URL('../scripts/preview-seasons.mjs', import.meta.url), 'utf8')
  assert.match(script, /process\.env\.VERCEL \|\| process\.env\.NODE_ENV === 'production'/)
  assert.match(script, /mkdtempSync\(join\(tmpdir\(\), 'footstats-seasons-'/)
  assert.match(script, /'GET','HEAD'/)
  assert.match(script, /status:405/)
  assert.match(script, /__ALLOW_GOAL_WRITES__', mode === 'goals' \? 'true' : 'false'/)
  for (const file of ['src/proxy.ts', 'src/utils/supabase/server.ts', 'src/app/dashboard/layout.tsx', 'src/app/profile/[userId]/layout.tsx', 'src/app/dashboard/components/NavigationProvider.tsx']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /x-footstats-demo|footstats-navigation-demo-visitor|fixtures\.json|NavigationPreviewSafety/)
  }
})
