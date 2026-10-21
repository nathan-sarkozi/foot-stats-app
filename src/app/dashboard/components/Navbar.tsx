'use client'

import { useEffect, useId, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import FootStatsBrand from '@/components/FootStatsBrand'
import { logout } from './logoutAction'
import s from './navigation.module.css'

const links = [
  { href: '/dashboard', label: 'Dashboard', index: '01' },
  { href: '/dashboard/community', label: 'Communauté', index: '02' },
  { href: '/dashboard/career', label: 'Ma Carrière', index: '03' },
  { href: '/dashboard/records', label: 'Mes records', index: '04' },
]

function isActive(path: string, href: string) {
  if (href === '/dashboard') return path === href || path.startsWith('/dashboard/add-match') || path.startsWith('/dashboard/edit-match/')
  if (href === '/dashboard/community') return path === href || path.startsWith('/profile/')
  return path === href || path.startsWith(`${href}/`)
}

function LogoutIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7-14 5 5-5 5M21 12H9" /></svg>
}

export default function Navbar({ initials = 'FS', avatarUrl = null }: { initials?: string | null; avatarUrl?: string | null }) {
  const pathname = usePathname()
  const menu = useRef<HTMLDetailsElement>(null)
  const toggle = useRef<HTMLElement>(null)
  const panelId = useId()

  // Native disclosure handles expanded state, keyboard activation and tab order.
  // These listeners only close it; no modal role or custom focus trap is needed.
  useEffect(() => {
    const details = menu.current
    const close = (restoreFocus: boolean) => {
      if (!details?.open) return
      details.open = false
      if (restoreFocus) toggle.current?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details?.open) { event.preventDefault(); close(true) }
    }
    const onOutside = (event: Event) => {
      if (event.target instanceof Node && !details?.contains(event.target)) close(false)
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onDesktop = () => {
      if (!desktop.matches) return
      const focusInside = details?.contains(document.activeElement)
      close(false)
      if (focusInside) {
        const nav = details?.closest('nav')
        const destination = nav?.querySelector<HTMLAnchorElement>('a[aria-current]') ?? nav?.querySelector<HTMLAnchorElement>('a')
        destination?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    desktop.addEventListener('change', onDesktop)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
      desktop.removeEventListener('change', onDesktop)
    }
  }, [])

  useEffect(() => { if (menu.current) menu.current.open = false }, [pathname])

  const closeMenu = () => { if (menu.current) menu.current.open = false }
  const current = (href: string) => pathname === href ? 'page' as const : isActive(pathname, href) ? 'location' as const : undefined

  return <nav className={s.navbar} aria-label="Navigation principale">
    <div className={s.bar}>
      <FootStatsBrand />
      <div className={s.desktopLinks}>{links.map(link => <Link key={link.href} href={link.href} className={s.navLink} aria-current={current(link.href)}>{link.label}</Link>)}</div>
      <div className={s.controls}>
        <Link href="/dashboard/add-match" className={s.addMatch}><span aria-hidden="true">＋</span> Ajouter un match</Link>
        <Link href="/dashboard/settings" className={s.avatar} aria-label="Paramètres du profil" aria-current={current('/dashboard/settings')}>
          {avatarUrl ? <Image src={avatarUrl} alt="" fill className={s.avatarImage} sizes="36px" /> : initials || 'FS'}
        </Link>
        <form action={logout} className={s.desktopLogout}><button type="submit" className={s.logoutButton} aria-label="Déconnexion" title="Déconnexion"><LogoutIcon /></button></form>
        <details ref={menu} className={s.mobileMenu}>
          <summary ref={toggle} className={s.menuToggle} aria-controls={panelId} aria-label="Menu de navigation">
            <span className={s.menuIcon} aria-hidden="true"><i /><i /></span><span>Menu</span>
          </summary>
          <div id={panelId} className={s.menuPanel}>
            <div className={s.menuIntro}><span>TON ESPACE DE JEU</span><strong>À toi de jouer.</strong></div>
            <ul>{links.map(link => <li key={link.href}><Link href={link.href} onClick={closeMenu} className={s.mobileLink} aria-current={current(link.href)}><span>{link.index}</span>{link.label}<span aria-hidden="true">↗</span></Link></li>)}</ul>
            <div className={s.mobileActions}><Link href="/dashboard/add-match" className={s.mobileAdd} onClick={closeMenu}><span aria-hidden="true">＋</span> Ajouter un match</Link><Link href="/dashboard/settings" className={s.mobileSettings} onClick={closeMenu} aria-current={current('/dashboard/settings')}>Paramètres <span aria-hidden="true">↗</span></Link></div>
            <form action={logout} className={s.mobileLogout}><button type="submit"><LogoutIcon /> Déconnexion</button></form>
          </div>
        </details>
      </div>
    </div>
  </nav>
}
