import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import * as competitionFilters from '../src/utils/competitionFilters.ts'
import { renderServerPage } from './helpers/render-server-page.mjs'

const { COMPETITIONS, parseCompetitionParams } = competitionFilters
const require = createRequire(import.meta.url)

// Evaluate the actual client component with navigation/hooks replaced explicitly.
// Tests never load .env, Supabase clients or a network service.
function competitionFilter(query) {
  const params = new URLSearchParams(query)
  const pushes = []
  const source = readFileSync(new URL('../src/app/dashboard/components/CompetitionFilter.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: 'CompetitionFilter.tsx',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText
  const fileModule = { exports: {} }
  const mocks = {
    '@/utils/competitionFilters': competitionFilters,
    react: { useCallback: callback => callback, useMemo: factory => factory() },
    'next/navigation': {
      useRouter: () => ({ push: url => pushes.push(url) }),
      useSearchParams: () => params,
    },
  }
  new vm.Script(compiled, { filename: 'CompetitionFilter.tsx' }).runInContext(vm.createContext({
    module: fileModule, exports: fileModule.exports,
    URLSearchParams,
    require(name) {
      if (name in mocks) return mocks[name]
      if (name === 'react/jsx-runtime') return require(name)
      throw new Error(`Unexpected filter import: ${name}`)
    },
  }))
  const tree = fileModule.exports.default()
  const buttons = tree.props.children
  return {
    selected: Array.from(buttons).filter(button => button.props.isActive).map(button => button.props.value),
    click(value) {
      const button = buttons.find(button => button.props.value === value)
      assert.ok(button)
      button.props.onClick(value)
      assert.equal(pushes.length, 1)
      return new URLSearchParams(pushes[0])
    },
  }
}

test('absent and historical empty filters keep all competitions selected', () => {
  for (const input of [undefined, null, '', [], [''], ['', '']]) {
    assert.deepEqual(parseCompetitionParams(input), COMPETITIONS)
  }
  assert.deepEqual(competitionFilter('').selected, COMPETITIONS)
  assert.deepEqual(competitionFilter('comps=').selected, COMPETITIONS)
})

test('historical comma-separated URLs and repeated parameters share the same selection', () => {
  for (const input of ['LEAGUE,CUP', ['LEAGUE', 'CUP'], ['LEAGUE,CUP', 'CUP'], ['LEAGUE', 'CUP,LEAGUE']]) {
    assert.deepEqual(parseCompetitionParams(input), ['LEAGUE', 'CUP'])
  }
  assert.deepEqual(competitionFilter('comps=LEAGUE%2CCUP').selected, ['LEAGUE', 'CUP'])
  assert.deepEqual(competitionFilter('comps=LEAGUE&comps=CUP').selected, ['LEAGUE', 'CUP'])
})

test('valid values survive normalization, whitespace and mixed invalid entries', () => {
  assert.deepEqual(parseCompetitionParams(' CUP ,UNKNOWN,LEAGUE,CUP,, '), ['CUP', 'LEAGUE'])
  assert.deepEqual(parseCompetitionParams(['', 1, null, {}, 'CUP', 'FRIENDLY,CUP']), ['CUP', 'FRIENDLY'])
})

test('explicit invalid filters remain empty rather than widening the selection', () => {
  for (const input of ['UNKNOWN', 'cup', ',,', ' ', 3, false, {}, [null, false, {}, 'UNKNOWN']]) {
    assert.deepEqual(parseCompetitionParams(input), [])
  }
  assert.deepEqual(competitionFilter('comps=UNKNOWN').selected, [])
})

test('normalization returns independent selections and does not mutate array inputs', () => {
  const values = ['CUP', 'LEAGUE,CUP']
  const snapshot = [...values]
  const result = parseCompetitionParams(values)
  result.push('FRIENDLY')
  assert.deepEqual(values, snapshot)
  assert.deepEqual(parseCompetitionParams(values), ['CUP', 'LEAGUE'])
  parseCompetitionParams(undefined).pop()
  assert.deepEqual(parseCompetitionParams(undefined), COMPETITIONS)
})

test('toggling repeated competition parameters preserves all unrelated query parameters', () => {
  const filter = competitionFilter('comps=LEAGUE&season=1985&comps=CUP&tag=one&tag=two&search=Club+%26+Co')
  const next = filter.click('LEAGUE')
  assert.deepEqual(next.getAll('comps'), ['CUP'])
  assert.equal(next.get('season'), '1985')
  assert.deepEqual(next.getAll('tag'), ['one', 'two'])
  assert.equal(next.get('search'), 'Club & Co')
})

test('adding the third competition removes only the competition query parameter', () => {
  const next = competitionFilter('comps=LEAGUE,CUP&season=2026&tag=one&tag=two').click('FRIENDLY')
  assert.equal(next.has('comps'), false)
  assert.equal(next.get('season'), '2026')
  assert.deepEqual(next.getAll('tag'), ['one', 'two'])
})

test('the final selected competition stays selected and invalid filters can be recovered', () => {
  assert.equal(competitionFilter('comps=CUP').click('CUP').get('comps'), 'CUP')
  assert.equal(competitionFilter('comps=UNKNOWN').click('CUP').get('comps'), 'CUP')
})

const statistic = (id, competition, values = {}) => ({
  has_played: true, minutes_played: 80, goals: 1, assists: 1,
  yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC', ...values,
  matches: {
    id, match_date: '2026-10-18', opponent: `Synthetic opponent ${id}`,
    team_score: 2, opponent_score: 1, competition_type: competition,
  },
})

test('dashboard repeated and historical filters produce identical cards, charts and history', async () => {
  const options = { statistics: [
    statistic('league', 'LEAGUE', { goals: 2 }),
    statistic('cup', 'CUP', { has_played: false, yellow_cards: 1 }),
    statistic('friendly', 'FRIENDLY', { goals: 10 }),
  ] }
  const historical = await renderServerPage('src/app/dashboard/page.tsx', {
    ...options, searchParams: { comps: 'LEAGUE,CUP' },
  })
  const repeated = await renderServerPage('src/app/dashboard/page.tsx', {
    ...options, searchParams: { comps: ['LEAGUE', 'CUP', 'UNKNOWN'] },
  })
  assert.deepEqual(repeated.cards, historical.cards)
  assert.deepEqual(repeated.charts, historical.charts)
  assert.equal(repeated.html, historical.html)
  assert.equal(repeated.cards.find(card => card.title === 'Matchs Joués').value, 1)
  assert.equal(repeated.cards.find(card => card.title === 'Discipline').value, 1)
  assert.match(repeated.html, /Synthetic opponent cup/)
  assert.doesNotMatch(repeated.html, /Synthetic opponent friendly/)
})

test('dashboard empty URLs preserve all rows while invalid values render the empty state', async () => {
  for (const comps of [undefined, '', []]) {
    const { cards } = await renderServerPage('src/app/dashboard/page.tsx', {
      searchParams: { comps }, statistics: [statistic('cup', 'CUP')],
    })
    assert.equal(cards.find(card => card.title === 'Matchs Joués').value, 1)
  }
  const { html, cards } = await renderServerPage('src/app/dashboard/page.tsx', {
    searchParams: { comps: ['UNKNOWN', 'INVALID'] }, statistics: [statistic('cup', 'CUP')],
  })
  assert.equal(cards.find(card => card.title === 'Matchs Joués').value, 0)
  assert.match(html, /Aucun match enregistré avec ces filtres/)
})
