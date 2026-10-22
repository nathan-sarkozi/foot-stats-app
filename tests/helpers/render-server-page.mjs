import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as playerStats from '../../src/utils/playerStats.ts'
import * as readErrors from '../../src/utils/readErrors.ts'
import { cssModuleMock, loadUiModule } from './load-ui-module.mjs'
import * as competitionFilters from '../../src/utils/competitionFilters.ts'
import * as seasonPresentation from '../../src/utils/seasonPresentation.ts'
import { loadSeasonContext } from '../../src/utils/loadSeasonContext.ts'

const require = createRequire(import.meta.url)
export const PUBLIC_USER_ID = '00000000-0000-4000-8000-000000000001'

// Evaluate only the page under test. Supabase, widgets and navigation are
// explicitly mocked: no .env, database, HTTP service or production data.
export async function renderServerPage(relativePath, options = {}) {
  const queries = options.queries ?? []
  const cards = []
  const charts = []
  const widgets = []
  const profile = options.profile === undefined ? {
    id: PUBLIC_USER_ID, display_name: 'Synthetic player', club: 'Synthetic club',
    category: 'Senior', rbfa_team_id: null,
  } : options.profile

  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === undefined ? { id: 'test-player' } : options.user } }) },
    from(table) {
      const query = { table, select: null, filters: [] }
      queries.push(query)
      const result = () => {
        if (table === 'profiles') {
          const visitor = query.select === 'display_name, avatar_url'
          return {
            data: visitor && options.visitorProfile !== undefined ? options.visitorProfile : profile,
            error: visitor ? options.visitorProfileError ?? null : options.profileError ?? null,
          }
        }
        if (table === 'statistics') return { data: options.statistics ?? [], error: options.statisticsError ?? null }
        if (table === 'matches') return { data: (options.matches ?? (options.statistics ?? []).map(stat => stat.matches)).slice(...(query.range ?? [0])), error: options.matchesError ?? null }
        if (table === 'career_entries') return { data: (options.careerEntries ?? []).slice(...(query.range ?? [0])), error: options.careerError ?? null }
        throw new Error(`Unexpected mocked table: ${table}`)
      }
      const builder = {
        select(value) { query.select = value; return builder },
        eq(...args) { query.filters.push({ method: 'eq', args }); return builder },
        gte(...args) { query.filters.push({ method: 'gte', args }); return builder },
        lt(...args) { query.filters.push({ method: 'lt', args }); return builder },
        order(...args) { query.filters.push({ method: 'order', args }); return builder },
        range(start, end) { query.range = [start, end + 1]; return builder },
        returns() { return builder },
        single() { return Promise.resolve(result()) },
        maybeSingle() { query.singleRow = 'maybeSingle'; return Promise.resolve(result()) },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }
      return builder
    },
  }

  const component = value => ({ __esModule: true, default: value })
  const mocks = {
    '@/utils/supabase/server': { createClient: async () => client },
    '@/utils/playerStats': {
      ...playerStats,
      getCurrentSeason: () => playerStats.getCurrentSeason(new Date(2026, 9, 19)),
    },
    '@/utils/navigation': loadUiModule('src/utils/navigation.ts', { './competitionFilters': competitionFilters }, { URLSearchParams }),
    '@/utils/readErrors': readErrors,
    '@/utils/competitionFilters': competitionFilters,
    '@/utils/seasonNavigation': loadUiModule('src/utils/seasonNavigation.ts', { './competitionFilters': competitionFilters }),
    '@/utils/loadSeasonContext': { loadSeasonContext },
    '@/utils/seasonPresentation': seasonPresentation,
    '@/utils/getClubLogo': { getClubLogo: () => undefined },
    'next/navigation': {
      notFound() { throw new Error('NOT_FOUND') },
      redirect(path) { throw new Error(`REDIRECT:${path}`) },
    },
    'next/link': component(({ children, ...props }) => React.createElement('a', props, children)),
    'next/image': component(() => null),
  }

  const statCard = ({ title, value, subtitle }) => {
    cards.push({ title, value, subtitle })
    return React.createElement('article', null,
      React.createElement('h3', null, title),
      React.createElement('p', null, value),
      React.createElement('p', null, subtitle))
  }
  const statsChart = ({ data }) => { charts.push(data); return null }
  const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: relativePath,
  }).outputText
  const pageModule = { exports: {} }
  const context = vm.createContext({
    module: pageModule, exports: pageModule.exports,
    console,
    require(name) {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.module.css')) return cssModuleMock
      if (name.endsWith('/MatchSummary')) return loadUiModule('src/app/dashboard/components/MatchSummary.tsx', mocks)
      if (name.endsWith('/PublicMatchCard')) return loadUiModule('src/app/profile/[userId]/components/PublicMatchCard.tsx', mocks)
      if (name.endsWith('/StatCard')) return component(statCard)
      if (name.endsWith('/StatsChart')) return component(statsChart)
      if (name.endsWith('/SeasonSelector')) return component(props => { widgets.push({ name: 'SeasonSelector', props }); return null })
      if (name.endsWith('/SeasonCareerContext')) return loadUiModule('src/components/SeasonCareerContext.tsx', mocks)
      if (name.endsWith('/SeasonStatCards')) return loadUiModule('src/components/SeasonStatCards.tsx', { '@/app/dashboard/components/StatCard': component(statCard) })
      if (name.endsWith('/TeamWidget') || name.endsWith('/CompetitionFilter') || name.endsWith('/FormGuide')) {
        return component(props => { widgets.push({ name: name.split('/').at(-1), props }); return null })
      }
      if (name.endsWith('/NavigationProvider')) return component(({ children }) => children)
      if (name.endsWith('/PerformanceNavigation')) return component(props => { widgets.push({ name: 'PerformanceNavigation', props }); return null })
      if (name.endsWith('/Navbar') || name.endsWith('/ProfileTabs')) return component(() => null)
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      throw new Error(`Unexpected page import: ${name}`)
    },
  })
  new vm.Script(compiled, { filename: relativePath }).runInContext(context)
  const tree = await pageModule.exports.default({
    children: React.createElement('p', null, 'Synthetic child content'),
    params: Promise.resolve({ userId: options.userId ?? PUBLIC_USER_ID }),
    searchParams: Promise.resolve(options.searchParams ?? {}),
  })
  return { html: renderToStaticMarkup(tree), queries, cards, charts, widgets }
}
