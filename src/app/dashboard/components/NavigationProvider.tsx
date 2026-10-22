'use client'

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { isPerformancePage, navigationSourceKey, type NavigationScope } from '@/utils/navigation'

type Registration = { token: object; key: string; scope: NavigationScope }
type Action = { type: 'register'; value: Registration } | { type: 'unregister'; token: object }
type Register = (key: string, scope: NavigationScope) => () => void
const ScopeContext = createContext<NavigationScope | null>(null)
const RegistrationContext = createContext<Register | null>(null)

function reducer(previous: Registration | null, action: Action): Registration | null {
  if (action.type === 'register') return action.value
  return previous?.token === action.token ? null : previous
}

/** UI context only: the pages publish their existing validated selections. The
 * persistent mobile bar remains available while a new page is loading. */
export default function NavigationProvider({ currentYear, children }: { currentYear: number; children: ReactNode }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const [registration, dispatch] = useReducer(reducer, null)
  const key = navigationSourceKey(pathname, { season: params.getAll('season'), comps: params.getAll('comps'), compare: params.getAll('compare') })
  const register = useCallback<Register>((sourceKey, scope) => {
    const token = {}
    dispatch({ type: 'register', value: { token, key: sourceKey, scope } })
    return () => dispatch({ type: 'unregister', token })
  }, [])
  const fallback = useMemo(() => ({ currentYear }), [currentYear])
  const scope = isPerformancePage(pathname) && registration?.key === key ? registration.scope : fallback
  return <RegistrationContext.Provider value={register}><ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider></RegistrationContext.Provider>
}

export function useNavigationScope() {
  const scope = useContext(ScopeContext)
  if (!scope) throw new Error('NavigationProvider est requis pour la navigation privée.')
  return scope
}

export function useNavigationRegistration() {
  const register = useContext(RegistrationContext)
  if (!register) throw new Error('NavigationProvider est requis pour les performances.')
  return register
}
