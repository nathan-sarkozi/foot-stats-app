import Link from 'next/link'
import type { SeasonCareer } from '@/utils/seasonNavigation'
import s from './season-navigation.module.css'

export default function SeasonCareerContext({ entries, href }: { entries: readonly SeasonCareer[], href: string }) {
  if (!entries.length) return null
  return <section className={s.career} aria-label="Informations manuelles de carrière">
    <div className={s.heading}><div><span>CARRIÈRE · SAISON RENSEIGNÉE</span><h2>Carrière renseignée</h2></div><Link href={href}>Voir la carrière ↗</Link></div>
    <p>Ces données manuelles ne sont jamais ajoutées aux statistiques des matchs.</p>
    {entries.map(entry => <article className={s.entry} key={entry.id}>
      <div><h3>{entry.is_free_agent ? 'Sans club' : entry.club || 'Club non renseigné'}</h3><span>{entry.is_youth ? 'Jeunes' : 'Seniors'}{!entry.is_free_agent && entry.category ? ` · ${entry.category}` : ''}</span></div>
      {entry.is_free_agent ? <p>Période sans club renseignée.</p> : entry.has_stats === true ? <dl>{[
        ['Matchs', entry.matches_played], ['Buts', entry.goals], ['Passes décisives', entry.assists], ['Jaunes', entry.yellow_cards], ['Rouges', entry.red_cards],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl> : <p>Statistiques <strong>Non communiquées</strong></p>}
    </article>)}
  </section>
}
