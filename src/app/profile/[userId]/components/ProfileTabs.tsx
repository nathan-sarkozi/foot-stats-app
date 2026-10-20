'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import s from '../profile.module.css'

export default function ProfileTabs({ userId }: { userId: string }) {
  const pathname = usePathname()
  
  const tabs = [
    { name: 'Saison Actuelle', href: `/profile/${userId}` },
    { name: 'Carrière', href: `/profile/${userId}/career` }
  ]

  return (
    <nav className={s.tabs} aria-label="Sections du profil du joueur">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={s.tab}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.name}
          </Link>
        )
      })}
    </nav>
  )
}
