'use client'

import { useId } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { seasonKey } from '@/utils/seasonNavigation'
import type { Season } from '@/utils/playerStats'
import s from './season-navigation.module.css'

export default function SeasonSelector({ seasons, selected, currentYear }: { seasons: Season[], selected: Season, currentYear: number }) {
  const id = useId()
  const router = useRouter()
  const params = useSearchParams()
  return <div className={s.selector}>
    <div className={s.control}><label htmlFor={id}>SAISON SPORTIVE</label><select id={id} value={seasonKey(selected)} onChange={event => {
      const next = new URLSearchParams(params.toString())
      next.set('season', event.target.value)
      next.delete('comps')
      router.push(`?${next.toString()}`, { scroll: false })
    }}>{seasons.map(season => <option key={season.startYear} value={seasonKey(season)}>{seasonKey(season)}{season.startYear === currentYear ? ' · En cours' : ''}</option>)}</select></div>
    <p>Changer de saison réaffiche toutes ses compétitions.</p>
  </div>
}
