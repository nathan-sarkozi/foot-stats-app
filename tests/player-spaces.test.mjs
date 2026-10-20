import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import { PUBLIC_USER_ID, renderServerPage } from './helpers/render-server-page.mjs'
import * as avatar from '../src/utils/avatar.ts'
import * as playerStats from '../src/utils/playerStats.ts'
import { EMPTY_FORM_STATE } from '../src/utils/formState.ts'

// All records are invented. Every transport and server action is replaced.
// These tests do not load .env, contact Supabase or upload any file.
const component = value => ({ __esModule: true, default: value })
const next = {
  'next/link': component(({ children, ...props }) => React.createElement('a', props, children)),
  'next/image': component(({ src, alt, sizes }) => React.createElement('img', { src, alt, sizes })),
}
const profile = { id: PUBLIC_USER_ID, display_name: 'Synthetic Captain', avatar_url: '/fixture-player.png', club: 'Synthetic Sporting', category: 'P3', preferred_position: 'MC', foot_preference: 'Gaucher', jersey_number: 8, height: 181, weight: 76, rbfa_team_id: '123456' }
const entry = { id: '30000000-0000-4000-8000-000000000001', player_id: PUBLIC_USER_ID, season_start: 1985, season_end: 1986, is_youth: true, is_free_agent: false, club: 'Synthetic Academy', category: 'U17', has_stats: true, matches_played: 10, goals: 0, assists: 2, yellow_cards: 1, red_cards: 0 }

test('public player presentation keeps identity, athletic attributes and the exact public projection', async () => {
  const { html, queries } = await renderServerPage('src/app/profile/[userId]/layout.tsx', { profile: { ...profile, email: 'private@fixture.invalid', secret_field: 'must-never-be-shown' } })
  for (const text of [profile.display_name, profile.club, profile.category, profile.preferred_position, profile.foot_preference, '181 cm', '76 kg', 'NUMÉRO DE MAILLOT']) assert.ok(html.includes(text), text)
  assert.match(html, />8<\/span>/)
  assert.match(html, /href="\/dashboard\/community"/)
  assert.doesNotMatch(html, /private@fixture|must-never-be-shown|<form|edit-match/)
  const target = queries.find(query => query.select !== 'display_name, avatar_url')
  assert.equal(target.select, 'display_name, avatar_url, club, category, preferred_position, foot_preference, jersey_number, height, weight')
  assert.deepEqual(target.filters, [{ method: 'eq', args: ['id', PUBLIC_USER_ID] }])
})

test('missing public attributes stay unknown without inventing a club, number or physical measurement', async () => {
  const { html } = await renderServerPage('src/app/profile/[userId]/layout.tsx', { profile: { ...profile, avatar_url: null, club: null, category: null, preferred_position: null, jersey_number: null, foot_preference: null, height: null, weight: null } })
  assert.match(html, /Club non renseigné/)
  assert.match(html, /Catégorie non renseignée/)
  assert.match(html, /Poste non renseigné/)
  assert.match(html, />SY<\/div>/)
  assert.match(html, /<dd>—<\/dd>/)
  assert.doesNotMatch(html, /0 cm|0 kg|Agent libre/)
})

test('public profile tabs keep both destinations and native accessible active navigation', () => {
  for (const suffix of ['', '/career']) {
    const Tabs = loadUiModule('src/app/profile/[userId]/components/ProfileTabs.tsx', { ...next, 'next/navigation': { usePathname: () => `/profile/${PUBLIC_USER_ID}${suffix}` } }).default
    const html = renderToStaticMarkup(React.createElement(Tabs, { userId: PUBLIC_USER_ID }))
    assert.match(html, /aria-label="Sections du profil du joueur"/)
    assert.ok(html.includes(`href="/profile/${PUBLIC_USER_ID}"`))
    assert.ok(html.includes(`href="/profile/${PUBLIC_USER_ID}/career"`))
    assert.equal(html.match(/aria-current="page"/g)?.length, 1)
    assert.ok(new RegExp(`href="/profile/${PUBLIC_USER_ID}${suffix}"[^>]*aria-current="page"`).test(html))
  }
})

const stat = overrides => ({ has_played: true, minutes_played: 0, goals: 0, assists: null, yellow_cards: 0, red_cards: 0, is_motm: null, position_played: null,
  matches: { id: 'synthetic-match', match_date: '2026-10-18', opponent: 'Synthetic Racing', competition_type: 'CUP', team_score: null, opponent_score: 0 }, ...overrides })

test('public matches stay read-only and distinguish known zero, unknown fields and non-participation sanctions', () => {
  const Card = loadUiModule('src/app/profile/[userId]/components/PublicMatchCard.tsx', { ...next, '@/utils/getClubLogo': { getClubLogo: () => undefined } }).default
  const html = renderToStaticMarkup(React.createElement(Card, { stat: stat() }))
  assert.match(html, /Score incomplet/)
  assert.match(html, /<b>0<\/b> buts/)
  assert.match(html, /<b>—<\/b> passes décisives/)
  assert.match(html, /<b>0′<\/b> minutes/)
  assert.match(html, /MOTM : —/)
  assert.doesNotMatch(html, /<form|<button|edit-match|player_id/)
  const bench = renderToStaticMarkup(React.createElement(Card, { stat: stat({ has_played: false, yellow_cards: 2, red_cards: 1, minutes_played: 90, goals: 7, assists: 8 }) }))
  assert.match(bench, /N’a pas joué/)
  assert.match(bench, /🟨<\/span> 2/)
  assert.match(bench, /🟥<\/span> 1/)
  assert.doesNotMatch(bench, /90′|>7<\/b> buts|>8<\/b> passes/)
  const unknown = renderToStaticMarkup(React.createElement(Card, { stat: stat({ has_played: null }) }))
  assert.match(unknown, /Participation non renseignée/)
  assert.doesNotMatch(unknown, /N’a pas joué/)
})

test('public career keeps old years, youth/senior chapters and unknown statistics without fabricated zeroes', async () => {
  const { html } = await renderServerPage('src/app/profile/[userId]/career/page.tsx', { profile, careerEntries: [entry, { ...entry, id: 'other-entry', season_start: 2005, season_end: 2006, is_youth: false, has_stats: null, club: 'Synthetic historical club' }, { ...entry, id: 'nullable-entry', season_start: 2006, season_end: 2007, is_youth: false, goals: null, assists: null, club: 'Synthetic incomplete club' }] })
  for (const text of ['Carrière Senior', 'Parcours Jeune', '1985 — 1986', 'Synthetic Academy', 'Non communiquées', 'SAISON RENSEIGNÉE', 'SAISON CALCULÉE']) assert.ok(html.includes(text), text)
  assert.match(html, /<span>—<\/span>/)
  assert.doesNotMatch(html, /edit-match|<form/)
})

function elements(node, type) {
  if (!node || typeof node !== 'object') return []
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => elements(child, type))]
}

async function privatePage(path, options = {}) {
  const forms = [], queries = [], actionCalls = []
  const actions = Object.fromEntries(['updateProfile', 'updateAvatar', 'saveCareerEntry', 'deleteCareerEntry'].map(name => [name, async (...args) => { actionCalls.push([name, args]); return EMPTY_FORM_STATE }]))
  const Feedback = loadUiModule('src/components/ActionForm.tsx', { '@/utils/formState': { EMPTY_FORM_STATE } }).FormFeedback
  function TransportForm({ children, action, variant, ...props }) { forms.push({ action, variant }); return React.createElement('form', props, React.createElement(Feedback, { variant, state: options.state ?? EMPTY_FORM_STATE }), children) }
  const Button = loadUiModule('src/app/dashboard/components/SubmitButton.tsx', { 'react-dom': { useFormStatus: () => ({ pending: false }) }, '@/utils/cn': { cn: (...values) => values.filter(Boolean).join(' ') } }).default
  const Avatar = loadUiModule('src/components/AvatarInput.tsx', { '@/utils/avatar': avatar }).default
  const careerHelper = loadUiModule('src/app/dashboard/career/career-form.ts', { zod: await import('zod'), '@/utils/playerStats': playerStats })
  const CareerForm = loadUiModule('src/app/dashboard/career/components/CareerForm.tsx', {
    '../actions': actions, '../career-form': careerHelper, '@/utils/formState': { EMPTY_FORM_STATE }, '@/components/ActionForm': { FormFeedback: Feedback }, '@/app/dashboard/components/SubmitButton': component(Button), '@/data/belgian_clubs.json': component([]),
  }).default
  const Delete = loadUiModule('src/app/dashboard/career/components/DeleteCareerButton.tsx', { '../actions': actions, '@/utils/formState': { EMPTY_FORM_STATE }, '@/components/ActionForm': { FormFeedback: Feedback } }).default
  const Page = loadUiModule(path, {
    ...next, './actions': actions, '@/components/ActionForm': component(TransportForm), '@/app/dashboard/components/SubmitButton': component(Button),
    '@/components/AvatarInput': component(Avatar), '@/utils/avatar': avatar, '@/data/belgian_clubs.json': component([]),
    './components/CareerForm': component(CareerForm), '../../components/CareerForm': component(CareerForm), './components/DeleteCareerButton': component(Delete), '../../career-form': careerHelper,
    'next/navigation': { redirect(url) { throw new Error(`REDIRECT:${url}`) }, notFound() { throw new Error('NOT_FOUND') } },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.user === undefined ? { id: PUBLIC_USER_ID } : options.user } }) },
      from(table) { const query = { table, filters: [] }; queries.push(query)
        const result = single => ({ data: table === 'profiles' ? (options.profile === undefined ? profile : options.profile) : single ? (options.entry ?? entry) : (options.entries ?? [entry]), error: options.error ?? null })
        const builder = { select(value) { query.select = value; return builder }, eq(...args) { query.filters.push(args); return builder }, order(...args) { query.order = args; return builder }, single: async () => result(true), maybeSingle: async () => result(true), then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject) } }
        return builder
      },
    }) },
  }).default
  const tree = await Page({ searchParams: Promise.resolve(options.searchParams ?? {}), params: Promise.resolve({ id: entry.id }) })
  return { html: renderToStaticMarkup(tree), tree, forms, queries, actions, actionCalls }
}

test('settings preserve the exact private projection, avatar action, profile action and every input contract', async () => {
  const result = await privatePage('src/app/dashboard/settings/page.tsx')
  assert.equal(result.queries[0].select, 'display_name, avatar_url, club, category, preferred_position, foot_preference, jersey_number, height, weight, rbfa_team_id')
  assert.deepEqual(result.queries[0].filters, [['id', PUBLIC_USER_ID]])
  assert.equal(result.forms.length, 2)
  assert.equal(result.forms[0].action, result.actions.updateAvatar)
  assert.equal(result.forms[1].action, result.actions.updateProfile)
  for (const form of result.forms) assert.equal(form.variant, 'stade')
  for (const name of ['display_name', 'club', 'category', 'preferred_position', 'foot_preference', 'jersey_number', 'height', 'weight', 'rbfa_team_id', 'avatar']) assert.ok(result.html.includes(`name="${name}"`), name)
  for (const text of ['Synthetic Captain', '123456', '4 Mio', '/team/']) assert.ok(result.html.includes(text), text)
  assert.match(result.html, /src="\/fixture-player.png"/)
  assert.ok(result.html.includes(`accept="${avatar.AVATAR_ACCEPT}"`))
  assert.match(result.html, /id="avatar"[^>]*required/)
  const height = result.html.match(/<input(?=[^>]*name="height")[^>]*>/)?.[0] ?? ''
  assert.match(height, /min="100"/)
  assert.match(height, /max="250"/)
  assert.equal(result.actionCalls.length, 0)
})

test('settings show success and failures without replacing a failed read with a form or a 404', async () => {
  for (const success of ['avatar', 'profile']) {
    const result = await privatePage('src/app/dashboard/settings/page.tsx', { searchParams: { success } })
    assert.match(result.html, /role="status"/)
    assert.match(result.html, success === 'avatar' ? /photo de profil a été mise à jour/ : /informations ont été enregistrées/)
  }
  const failure = await privatePage('src/app/dashboard/settings/page.tsx', { profile: null, error: { code: '42501' } })
  assert.match(failure.html, /role="alert"/)
  assert.doesNotMatch(failure.html, /<form|NOT_FOUND|42501/)
  const anonymous = await privatePage('src/app/dashboard/settings/page.tsx', { user: null })
  assert.equal(anonymous.html, '')
})

test('career management and historical editing keep owner-scoped reads, links and initial season', async () => {
  const list = await privatePage('src/app/dashboard/career/page.tsx')
  assert.deepEqual(list.queries[0].filters, [['player_id', PUBLIC_USER_ID]])
  assert.deepEqual(JSON.parse(JSON.stringify(list.queries[0].order)), ['season_end', { ascending: false }])
  assert.ok(list.html.includes(`href="/dashboard/career/edit/${entry.id}"`))
  const edit = await privatePage('src/app/dashboard/career/edit/[id]/page.tsx')
  assert.deepEqual(edit.queries[0].filters, [['id', entry.id], ['player_id', PUBLIC_USER_ID]])
  assert.match(edit.html, /value="1985" selected="">1985 - 1986/)
  assert.match(edit.html, /name="entry_id"[^>]*value="30000000/)
  assert.match(edit.html, /name="goals"[^>]*value="0"/)
  assert.equal(edit.actionCalls.length, 0)
  await assert.rejects(privatePage('src/app/dashboard/career/page.tsx', { user: null }), /REDIRECT:\/login/)
})

test('career empty state keeps the creation form and unknown historical stats stay blank and disabled', async () => {
  const empty = await privatePage('src/app/dashboard/career/page.tsx', { entries: [] })
  assert.match(empty.html, /Aucune saison historique enregistrée/)
  assert.match(empty.html, /Ajouter à ma carrière/)
  const unknown = await privatePage('src/app/dashboard/career/edit/[id]/page.tsx', { entry: { ...entry, has_stats: null, goals: null, assists: null } })
  assert.match(unknown.html, /name="has_stats"/)
  assert.doesNotMatch(unknown.html.match(/<input[^>]*id="has_stats"[^>]*>/)?.[0] ?? '', /checked/)
  for (const name of ['matches_played', 'goals', 'assists', 'yellow_cards', 'red_cards']) {
    const input = unknown.html.match(new RegExp(`<input[^>]*id="${name}"[^>]*>`))?.[0] ?? ''
    assert.match(input, /disabled/)
    assert.match(input, /value=""/)
  }
})

test('career deletion confirms first, retains its identifier and disables the pending action', () => {
  for (const pending of [false, true]) {
    let confirmed = false
    const action = async () => EMPTY_FORM_STATE
    const Delete = loadUiModule('src/app/dashboard/career/components/DeleteCareerButton.tsx', {
      react: { ...React, useActionState: () => [EMPTY_FORM_STATE, action, pending] }, '../actions': { deleteCareerEntry: action }, '@/utils/formState': { EMPTY_FORM_STATE }, '@/components/ActionForm': { FormFeedback: () => null },
    }, { window: { confirm: () => confirmed } }).default
    const tree = Delete({ entryId: entry.id })
    assert.equal(tree.props.action, action)
    assert.equal(elements(tree, 'input')[0].props.value, entry.id)
    assert.equal(elements(tree, 'button')[0].props.disabled, pending)
    let prevented = false
    tree.props.onSubmit({ preventDefault() { prevented = true } })
    assert.equal(prevented, true)
    confirmed = true; prevented = false
    tree.props.onSubmit({ preventDefault() { prevented = true } })
    assert.equal(prevented, false)
  }
})
