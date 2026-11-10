'use client'

import { useEffect, useId, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import FootStatsBrand from '@/components/FootStatsBrand'
import { activePerformance, buildNavigationLinks, isDestinationActive, isPerformancePage, SECONDARY_DESTINATIONS } from '@/utils/navigation'
import { useNavigationScope } from './NavigationProvider'
import MobileNavigation from './MobileNavigation'
import NavigationIcon from './NavigationIcon'
import { logout } from './logoutAction'
import s from './navigation.module.css'

export default function Navbar({ userId = null, initials = 'FS', avatarUrl = null, displayName = null }: { userId?: string | null; initials?: string | null; avatarUrl?: string | null; displayName?: string | null }) {
  const pathname = usePathname()
  const scope = useNavigationScope()
  const links = buildNavigationLinks(scope, userId ?? '')
  const account = useRef<HTMLDetailsElement>(null)
  const toggle = useRef<HTMLElement>(null)
  const panelId = useId()

  useEffect(() => {
    const details = account.current
    const close = () => { if (details) details.open = false }
    const outside = (event: Event) => { if (event.target instanceof Node && !details?.contains(event.target)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && details?.open) { event.preventDefault(); close(); toggle.current?.focus() } }
    const mobile = window.matchMedia('(max-width: 1023px)')
    const resize = () => {
      if (!mobile.matches || !details?.open) return
      const focused = details.contains(document.activeElement)
      close()
      if (focused) document.querySelector<HTMLElement>('[data-header-navigation] a')?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('popstate', close)
    mobile.addEventListener('change', resize)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', escape); window.removeEventListener('popstate', close); mobile.removeEventListener('change', resize) }
  }, [])
  useEffect(() => { if (account.current) account.current.open = false }, [pathname])

  const closeAccount = () => { if (account.current) account.current.open = false }
  const primary = ['career', 'community'] as const
  return <>
    <header className={s.navbar} data-header-navigation=""><div className={s.bar}>
      <FootStatsBrand href={userId ? '/dashboard' : '/'} />
      {userId ? <>
        <nav className={s.desktopLinks} aria-label="Navigation principale"><Link href={isPerformancePage(pathname) && scope.seasonYears ? '#performance-navigation' : '/dashboard'} className={s.navLink} aria-current={activePerformance(pathname) ? 'location' : undefined}>Performances</Link>{primary.map(id => {
          const destination = SECONDARY_DESTINATIONS.find(item => item.id === id)!
          return <Link key={id} href={links[id]} className={s.navLink} aria-current={isDestinationActive(id, pathname, userId) ? pathname === destination.path ? 'page' : 'location' : undefined}>{destination.label}</Link>
        })}</nav>
        <div className={s.controls}><Link href={links.add} className={s.addMatch} aria-label="Ajouter un match"><NavigationIcon name="plus" size={19} /><span className={s.addDesktopLabel}>Ajouter un match</span><span className={s.addMobileLabel}>Match</span></Link>
          <details ref={account} className={s.account}><summary ref={toggle} aria-controls={panelId} aria-label="Mon compte"><span className={s.avatar}>{avatarUrl ? <Image src={avatarUrl} alt="" fill className={s.avatarImage} sizes="36px" /> : initials || 'FS'}</span><span className={s.accountLabel}>{displayName || 'Mon compte'}<small>Profil et paramètres</small></span><NavigationIcon name="chevron" size={14} /></summary>
            <div className={s.accountPanel} id={panelId}><div className={s.accountIntro}><strong>{displayName || 'Mon compte'}</strong></div>{SECONDARY_DESTINATIONS.filter(destination => destination.group === 'account').map(destination => <Link key={destination.id} href={links[destination.id]} onClick={closeAccount} className={s.drawerLink} aria-current={isDestinationActive(destination.id, pathname, userId) ? 'location' : undefined}><NavigationIcon name={destination.icon} /><span>{destination.label}</span><span aria-hidden="true">↗</span></Link>)}<form action={logout} className={s.drawerLogout}><button type="submit"><NavigationIcon name="logout" size={18} />Déconnexion</button></form></div>
          </details>
        </div>
      </> : <nav className={s.publicLinks} aria-label="Navigation publique"><Link href="/login">Connexion</Link><Link href="/register">Inscription</Link></nav>}
    </div></header>
    {userId && <MobileNavigation userId={userId} />}
  </>
}
