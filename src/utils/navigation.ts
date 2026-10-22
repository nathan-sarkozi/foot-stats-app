import { COMPETITIONS, type Competition } from './competitionFilters'

export const PERFORMANCE_DESTINATIONS = [
  { id: 'dashboard', path: '/dashboard', label: 'Vue d’ensemble', mobileLabel: 'Stats', icon: 'grid' },
  { id: 'records', path: '/dashboard/records', label: 'Mes records', mobileLabel: 'Records', icon: 'award' },
  { id: 'review', path: '/dashboard/season-review', label: 'Mon bilan de saison', mobileLabel: 'Bilan', icon: 'chart' },
  { id: 'goals', path: '/dashboard/goals', label: 'Mes objectifs', mobileLabel: 'Objectifs', icon: 'target' },
] as const

export type PerformanceDestination = typeof PERFORMANCE_DESTINATIONS[number]['id']
export type NavigationDestination = PerformanceDestination | 'history' | 'career' | 'community' | 'profile' | 'settings' | 'add'
export type NavigationLinks = Record<NavigationDestination, string>

export const SECONDARY_DESTINATIONS = [
  { id: 'history', path: '/dashboard', label: 'Historique des matchs', icon: 'calendar', group: 'match' },
  { id: 'career', path: '/dashboard/career', label: 'Ma carrière', icon: 'route', group: 'journey' },
  { id: 'community', path: '/dashboard/community', label: 'Communauté', icon: 'users', group: 'collective' },
  { id: 'profile', path: '/profile', label: 'Mon profil public', icon: 'profile', group: 'account' },
  { id: 'settings', path: '/dashboard/settings', label: 'Paramètres', icon: 'settings', group: 'account' },
] as const

/** Presentation scope supplied by an already authenticated page, after its existing
 * season/filter validation. No data query or sporting calculation belongs here. */
export type NavigationScope = {
  currentYear: number
  seasonYear?: number
  seasonYears?: readonly number[]
  regularSeasonYears?: readonly number[]
  filteredCompetitions?: readonly Competition[]
  availableCompetitions?: readonly Competition[]
  comparisonYear?: number
}

const validYear = (value: number) => Number.isInteger(value) && value >= 1 && value <= 9998

export function buildNavigationLinks(scope: NavigationScope, userId: string): NavigationLinks {
  const current = scope.currentYear
  const seasonal = scope.seasonYear !== undefined && validYear(scope.seasonYear) && scope.seasonYears?.includes(scope.seasonYear)
    ? scope.seasonYear : current
  const regular = scope.regularSeasonYears ?? scope.seasonYears ?? [current]
  const year = regular.includes(seasonal) ? seasonal : current
  const requested = COMPETITIONS.filter(comp => scope.filteredCompetitions?.includes(comp))
  const available = COMPETITIONS.filter(comp => scope.availableCompetitions?.includes(comp))
  const filtered = available.filter(comp => requested.includes(comp))
  const query = (selected: number) => new URLSearchParams({ season: `${selected}-${selected + 1}` })
  const common = query(year)
  if (filtered.length > 0 && filtered.length < available.length) common.set('comps', filtered.join(','))
  const review = new URLSearchParams(common)
  if (scope.comparisonYear !== undefined && validYear(scope.comparisonYear) && regular.includes(scope.comparisonYear) && scope.comparisonYear !== year) {
    review.set('compare', `${scope.comparisonYear}-${scope.comparisonYear + 1}`)
  }
  const records = new URLSearchParams()
  if (requested.length > 0 && requested.length < COMPETITIONS.length) records.set('comps', requested.join(','))
  const dashboard = `/dashboard?${common}`
  return {
    dashboard,
    records: `/dashboard/records${records.size ? `?${records}` : ''}`,
    review: `/dashboard/season-review?${review}`,
    goals: `/dashboard/goals?${query(seasonal)}`,
    history: `${dashboard}#match-history`,
    career: '/dashboard/career', community: '/dashboard/community', settings: '/dashboard/settings',
    profile: `/profile/${encodeURIComponent(userId)}`, add: '/dashboard/add-match',
  }
}

export function isPerformancePage(pathname: string) {
  return PERFORMANCE_DESTINATIONS.some(destination => destination.path === pathname)
}

export function activePerformance(pathname: string): PerformanceDestination | null {
  if (pathname === '/dashboard/add-match' || pathname.startsWith('/dashboard/edit-match/')) return 'dashboard'
  return PERFORMANCE_DESTINATIONS.find(destination => destination.path === pathname)?.id ?? null
}

export function isDestinationActive(id: NavigationDestination, pathname: string, userId: string) {
  if (PERFORMANCE_DESTINATIONS.some(destination => destination.id === id)) return activePerformance(pathname) === id
  if (id === 'community') return pathname === '/dashboard/community' || pathname.startsWith('/profile/')
  if (id === 'profile') return pathname === `/profile/${userId}` || pathname === `/profile/${userId}/career`
  if (id === 'career') return pathname === '/dashboard/career' || pathname.startsWith('/dashboard/career/')
  if (id === 'settings') return pathname === '/dashboard/settings'
  return false
}

/** Only parameters understood by this page participate in registration. Extra
 * query parameters cannot invalidate it or be propagated to other screens. */
export function navigationSourceKey(pathname: string, params: Record<string, unknown>) {
  const keys = pathname === '/dashboard/records' ? ['comps'] : pathname === '/dashboard/goals' ? ['season'] : ['season', 'comps', ...(pathname === '/dashboard/season-review' ? ['compare'] : [])]
  return JSON.stringify([pathname, ...keys.map(key => {
    const value = params[key]
    return value === undefined ? [] : Array.isArray(value) ? value.filter(item => typeof item === 'string') : typeof value === 'string' ? [value] : []
  })])
}
