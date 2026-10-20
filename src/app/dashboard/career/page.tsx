import { createClient } from '@/utils/supabase/server'
import CareerForm from './components/CareerForm'
import DeleteCareerButton from './components/DeleteCareerButton'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import s from '../personal.module.css'
import ui from '@/components/stadium.module.css'

export default async function ManageCareerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: entries, error } = await supabase
    .from('career_entries')
    .select('*')
    .eq('player_id', user.id)
    .order('season_end', { ascending: false })

  if (error) {
    console.error('Carrière : chargement des saisons', { code: error.code, message: error.message })
    throw new Error('Impossible de charger les saisons de carrière.')
  }

  return <div className={s.page}>
    <Link href="/dashboard" className={s.back}><span aria-hidden="true">←</span> Retour au Dashboard</Link>
    <header className={s.hero}><div><span className={s.eyebrow}>LES CLUBS. LES SAISONS. TON HISTOIRE.</span><h1>Ma carrière<span>.</span></h1><p>Ajoute et gère tes anciennes saisons sportives. Les premiers terrains comptent autant que les derniers.</p></div><a href="#career-form" className={ui.primaryButton}><span aria-hidden="true">＋</span> Ajouter une saison</a></header>
    <div className={s.careerLayout}>
      <section aria-labelledby="saved-seasons-title"><div className={s.listHeading}><h2 id="saved-seasons-title">Saisons enregistrées</h2><span>{entries?.length ?? 0} saisons</span></div>
        {entries && entries.length > 0 ? <ol className={s.seasonList}>{entries.map(entry => <li key={entry.id} className={s.savedSeason}>
          <div className={s.savedStamp}><span>SAISON</span><strong>{entry.season_start}<small>— {entry.season_end}</small></strong></div>
          <div className={s.savedDetails}><span className={s.category}>{entry.is_youth ? 'Jeune' : 'Senior'}</span><h3>{entry.is_free_agent ? 'Sans club' : entry.club || 'Club non renseigné'}</h3>{!entry.is_free_agent && entry.category && <p>{entry.category}</p>}<small>{entry.has_stats ? 'Statistiques renseignées' : 'Statistiques non communiquées'}</small></div>
          <div className={s.savedActions}><Link href={`/dashboard/career/edit/${entry.id}`} className={s.editLink}>Éditer <span aria-hidden="true">↗</span></Link><DeleteCareerButton entryId={entry.id} /></div>
        </li>)}</ol> : <div className={s.empty}><strong>Le parcours commence quelque part.</strong><p>Aucune saison historique enregistrée. Ajoute la première lorsque tu le souhaites.</p></div>}
      </section>
      <aside id="career-form" className={s.careerAside}><CareerForm /></aside>
    </div>
  </div>
}
