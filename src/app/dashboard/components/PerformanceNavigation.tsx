'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activePerformance, buildNavigationLinks, PERFORMANCE_DESTINATIONS, type NavigationScope } from '@/utils/navigation'
import { useNavigationRegistration } from './NavigationProvider'
import NavigationIcon from './NavigationIcon'
import s from './navigation.module.css'

export default function PerformanceNavigation({ userId, sourceKey, scope }: { userId: string; sourceKey: string; scope: NavigationScope }) {
  const register = useNavigationRegistration()
  const pathname = usePathname()
  useEffect(() => register(sourceKey, scope), [register, sourceKey, scope])
  const links = buildNavigationLinks(scope, userId)
  return <nav id="performance-navigation" className={s.performanceTabs} aria-label="Mes performances">
    {PERFORMANCE_DESTINATIONS.map(destination => <Link key={destination.id} href={links[destination.id]} aria-current={activePerformance(pathname) === destination.id ? 'page' : undefined} data-navigation={destination.id}>
      <NavigationIcon name={destination.icon} /><span>{destination.label}</span>
    </Link>)}
  </nav>
}
