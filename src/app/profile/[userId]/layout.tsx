import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Navbar from '@/app/dashboard/components/Navbar'
import ProfileTabs from './components/ProfileTabs'
import { getClubLogo } from '@/utils/getClubLogo'
import { checkReadError, resourceIdSchema } from '@/utils/readErrors'
import s from './profile.module.css'
import NavigationProvider from '@/app/dashboard/components/NavigationProvider'
import { getCurrentSeason } from '@/utils/playerStats'
import navigation from '@/app/dashboard/components/navigation.module.css'

export default async function ProfileLayout(props: { children: React.ReactNode, params: Promise<{ userId: string }> }) {
  const targetUserId = (await props.params).userId
  if (!resourceIdSchema.safeParse(targetUserId).success) return notFound()
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  let visitorInitials: string | null = null
  let visitorAvatarUrl: string | null = null
  let visitorName: string | null = null

  if (authUser) {
    const { data: visitorProfile, error: visitorProfileError } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', authUser.id).maybeSingle()
    checkReadError(visitorProfileError, 'Lecture du profil visiteur')
    if (visitorProfile?.display_name) {
      visitorInitials = visitorProfile.display_name.substring(0, 2).toUpperCase()
      visitorAvatarUrl = visitorProfile.avatar_url
      visitorName = visitorProfile.display_name
    }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, club, category, preferred_position, foot_preference, jersey_number, height, weight')
    .eq('id', targetUserId)
    .maybeSingle()

  checkReadError(error, 'Lecture du profil public')
  if (!profile) return notFound()

  const playerClubLogo = getClubLogo(profile.club)

  return <NavigationProvider currentYear={getCurrentSeason().startYear}><div className={`${s.shell} ${authUser ? navigation.withMobileNavigation : ''}`}>
    <Navbar userId={authUser?.id ?? null} initials={visitorInitials} avatarUrl={visitorAvatarUrl} displayName={visitorName} />
    <main className={s.main}>
      <Link href="/dashboard/community" className={s.back}><span aria-hidden="true">←</span> Retour à la communauté</Link>
      <header className={s.hero}>
        <div className={s.playerIdentity}>
          <span className={s.eyebrow}>FOOTSTATS / LA FICHE JOUEUR</span>
          <div className={s.identityRow}>
            <div className={s.avatar}>{profile.avatar_url ? <Image src={profile.avatar_url} alt={profile.display_name} fill className={s.avatarImage} sizes="(max-width: 600px) 80px, 112px" /> : profile.display_name.substring(0, 2).toUpperCase()}</div>
            <div className={s.nameBlock}><h1>{profile.display_name}</h1><span className={s.position}>{profile.preferred_position || 'Poste non renseigné'}</span></div>
          </div>
          <div className={s.clubLine}><span className={s.crest}>{playerClubLogo ? <Image src={playerClubLogo} alt={profile.club!} fill className={s.crestImage} sizes="48px" /> : <span aria-hidden="true">{profile.club?.substring(0, 1).toUpperCase() || '—'}</span>}</span><div><strong>{profile.club || 'Club non renseigné'}</strong><span>{profile.category || 'Catégorie non renseignée'}</span></div></div>
          <dl className={s.attributes}><div><dt>Pied fort</dt><dd>{profile.foot_preference || '—'}</dd></div><div><dt>Taille</dt><dd>{profile.height !== null && profile.height !== undefined ? `${profile.height} cm` : '—'}</dd></div><div><dt>Poids</dt><dd>{profile.weight !== null && profile.weight !== undefined ? `${profile.weight} kg` : '—'}</dd></div></dl>
        </div>
        <div className={s.playerNumber}><div className={s.numberHeading}><span>LE JOUEUR</span><span aria-hidden="true">↗</span></div><span className={s.number}>{profile.jersey_number ?? '—'}</span><span className={s.numberLabel}>NUMÉRO DE MAILLOT</span><div className={s.numberFooter}><span>UN PARCOURS.<br />UNE HISTOIRE.</span><span>FOOTSTATS</span></div></div>
      </header>
      <ProfileTabs userId={targetUserId} />
      {props.children}
      <footer className={s.footer}><strong>footstats<span>.</span></strong><p>Le football se joue. Le parcours se raconte.</p><span>PROFIL DU JOUEUR</span></footer>
    </main>
  </div></NavigationProvider>
}
