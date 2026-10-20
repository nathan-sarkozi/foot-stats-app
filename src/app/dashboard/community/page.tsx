import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import s from './community.module.css'

export default async function CommunityPage() {
  const supabase = await createClient()

  // FIX: Ajout de avatar_url dans la clause select
  const { data: profilesData, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, club, category, preferred_position')
    .order('display_name', { ascending: true })
    .limit(50)

  if (error) {
    console.error('Directory Fetch Error:', error.message)
    return <div className={s.page}><p className={s.error} role="alert">Erreur lors du chargement des joueurs.</p></div>
  }

  return <div className={s.page}>
    <header className={s.hero}>
      <div><span className={s.eyebrow}>LES JOUEURS. LEURS PARCOURS.</span><h1>Le football<br />se partage<span>.</span></h1><p>Explore les profils et les saisons des autres joueurs.</p></div>
      <div className={s.directoryLabel}><span>FOOTSTATS / COMMUNAUTÉ</span><strong>{profilesData?.length ?? 0}<span>profils affichés</span></strong><small>50 premiers maximum · Ordre alphabétique</small></div>
    </header>
    <div className={s.sectionHeading}><span>01</span><h2>Communauté</h2><small>Les joueurs FootStats</small></div>
    {!profilesData?.length ? <div className={s.empty}><h3>Aucun joueur à afficher pour le moment.</h3><p>Les profils disponibles apparaîtront ici.</p></div> : <div className={s.grid}>
      {profilesData.map(profile => <Link href={`/profile/${profile.id}`} key={profile.id} className={s.playerCard}>
        <div className={s.cardTop}><span className={s.avatar}>{profile.avatar_url
          ? <Image src={profile.avatar_url} alt={`Avatar de ${profile.display_name}`} fill sizes="64px" className={s.avatarImage} />
          : profile.display_name.slice(0, 2).toUpperCase() || '?'}</span><span className={s.position}>{profile.preferred_position || 'Poste non renseigné'}</span></div>
        <h3>{profile.display_name || 'Profil sans nom'}</h3>
        <div className={s.club}><span className={s.clubMark} aria-hidden="true">▱</span><div><strong>{profile.club || 'Club non renseigné'}</strong>{profile.category && <span>{profile.category}</span>}</div></div>
        <div className={s.cardFooter}><span>Voir le profil</span><span aria-hidden="true">↗</span></div>
      </Link>)}
    </div>}
    <footer className={s.footer}><strong>footstats<span>.</span></strong><p>Un joueur, une saison, une histoire.</p><span>LE COLLECTIF</span></footer>
  </div>
}
