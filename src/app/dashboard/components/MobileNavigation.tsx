'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activePerformance, buildNavigationLinks, isDestinationActive, PERFORMANCE_DESTINATIONS, SECONDARY_DESTINATIONS } from '@/utils/navigation'
import { useNavigationScope } from './NavigationProvider'
import NavigationIcon from './NavigationIcon'
import useSoftKeyboard from './useSoftKeyboard'
import { logout } from './logoutAction'
import s from './navigation.module.css'

type ScrollLock = { y: number; styles: Pick<CSSStyleDeclaration, 'position' | 'overflow' | 'top' | 'left' | 'right' | 'width'> }

export default function MobileNavigation({ userId }: { userId: string }) {
  const scope = useNavigationScope()
  const pathname = usePathname()
  const links = buildNavigationLinks(scope, userId)
  const keyboardOpen = useSoftKeyboard()
  const panel = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const scrollLock = useRef<ScrollLock | null>(null)
  const restoreFocus = useRef(true)
  const [open, setOpen] = useState(false)
  const id = useId()

  const unlockScroll = useCallback(() => {
    const previous = scrollLock.current
    if (!previous) return
    scrollLock.current = null
    Object.assign(document.body.style, previous.styles)
    const behavior = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, previous.y)
    document.documentElement.style.scrollBehavior = behavior
  }, [])
  const close = useCallback((focus = true) => {
    restoreFocus.current = focus
    if (panel.current?.open) panel.current.close()
    unlockScroll()
  }, [unlockScroll])
  const show = () => {
    const dialog = panel.current
    if (!dialog || dialog.open) return
    const style = document.body.style
    const y = window.scrollY
    scrollLock.current = { y, styles: { position: style.position, overflow: style.overflow, top: style.top, left: style.left, right: style.right, width: style.width } }
    Object.assign(style, { position: 'fixed', overflow: 'hidden', top: `-${y}px`, left: '0', right: '0', width: '100%' })
    restoreFocus.current = true
    try { dialog.showModal(); setOpen(true) } catch (error) { unlockScroll(); throw error }
  }
  useEffect(() => {
    const onBack = () => close(false)
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onDesktop = () => {
      if (!desktop.matches || !panel.current?.open) return
      close(false)
      document.querySelector<HTMLElement>('[data-header-navigation] a[aria-current], [data-header-navigation] a')?.focus()
    }
    window.addEventListener('popstate', onBack)
    desktop.addEventListener('change', onDesktop)
    return () => { window.removeEventListener('popstate', onBack); desktop.removeEventListener('change', onDesktop); unlockScroll() }
  }, [close, unlockScroll])
  useEffect(() => { close(false) }, [pathname, close])

  return <>
    <nav className={s.bottomBar} aria-label="Navigation mobile" hidden={keyboardOpen}>
      {PERFORMANCE_DESTINATIONS.map(destination => <Link key={destination.id} href={links[destination.id]} className={s.bottomItem} onClick={() => close(false)} aria-label={destination.label} aria-current={activePerformance(pathname) === destination.id ? pathname === destination.path ? 'page' : 'location' : undefined} data-navigation={destination.id}>
        <NavigationIcon name={destination.icon} /><span>{destination.mobileLabel}</span>
      </Link>)}
      <button type="button" ref={trigger} className={s.bottomItem} onClick={show} aria-label="Plus de destinations" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-panel`} aria-current={!activePerformance(pathname) ? 'location' : undefined} data-navigation="more"><NavigationIcon name="more" /><span>Plus</span></button>
    </nav>
    <dialog ref={panel} id={`${id}-panel`} className={s.drawer} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); close() }} onClose={() => { setOpen(false); unlockScroll(); if (restoreFocus.current) trigger.current?.focus() }} onClick={event => {
      if (event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close()
    }}>
      <div className={s.drawerHeading}><div><h2 id={`${id}-title`}>Mon espace</h2></div><button type="button" onClick={() => close()} className={s.closeDrawer} aria-label="Fermer la navigation"><NavigationIcon name="close" /></button></div>
      <p id={`${id}-description`} className={s.drawerDescription}>Matchs, carrière et compte.</p>
      <Link href={links.add} className={s.drawerAdd} onClick={() => close(false)}><NavigationIcon name="plus" />Ajouter un match</Link>
      <nav aria-label="Destinations complémentaires">
        {[
          { id: 'match', title: 'LES RENCONTRES' }, { id: 'journey', title: 'MON PARCOURS' },
          { id: 'collective', title: 'LE COLLECTIF' }, { id: 'account', title: 'MON COMPTE' },
        ].map(group => <section key={group.id} className={s.drawerGroup}><h3>{group.title}</h3>{SECONDARY_DESTINATIONS.filter(destination => destination.group === group.id).map(destination => <Link key={destination.id} href={links[destination.id]} onClick={() => close(false)} className={s.drawerLink} aria-current={isDestinationActive(destination.id, pathname, userId) ? 'location' : undefined} data-navigation={destination.id}><NavigationIcon name={destination.icon} /><span>{destination.label}</span><span aria-hidden="true">↗</span></Link>)}</section>)}
      </nav>
      <form action={logout} className={s.drawerLogout}><button type="submit" onClick={() => close(false)}><NavigationIcon name="logout" size={18} />Déconnexion</button></form>

    </dialog>
  </>
}
