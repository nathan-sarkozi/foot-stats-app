import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Navbar from '@/app/dashboard/components/Navbar'
import ProfileTabs from './components/ProfileTabs'
import { getClubLogo } from '@/utils/getClubLogo'

export default async function ProfileLayout(props: { children: React.ReactNode, params: Promise<{ userId: string }> }) {
  const supabase = await createClient()
  const targetUserId = (await props.params).userId

  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  let visitorInitials = null
  let visitorAvatarUrl = null

  if (authUser) {
    const { data: visitorProfile } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', authUser.id).single()
    if (visitorProfile?.display_name) {
      visitorInitials = visitorProfile.display_name.substring(0, 2).toUpperCase()
      visitorAvatarUrl = visitorProfile.avatar_url
    }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, club, category, preferred_position, foot_preference, jersey_number, height, weight')
    .eq('id', targetUserId)
    .single()

  if (error || !profile) return notFound()

  const playerClubLogo = getClubLogo(profile.club)

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar initials={visitorInitials} avatarUrl={visitorAvatarUrl} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-6">
          <Link href="/dashboard/community" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">
            &larr; Retour à la communauté
          </Link>
        </div>

        <header className="mb-8 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-start gap-6 relative">
          <div className="h-24 w-24 shrink-0 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-extrabold text-4xl border border-indigo-100 overflow-hidden relative">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.display_name} fill className="object-cover" sizes="96px" />
            ) : (
              profile.display_name.substring(0, 2).toUpperCase()
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{profile.display_name}</h1>
              {profile.preferred_position && (
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider rounded-lg border border-indigo-100">{profile.preferred_position}</span>
              )}
            </div>
            
            {(profile.club || profile.category) ? (
              <div className="mt-4 inline-flex items-center gap-4 bg-slate-50 pr-6 pl-2 py-2 rounded-2xl border border-slate-100">
                <div className="relative w-12 h-12 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                  {playerClubLogo ? (
                    <Image src={playerClubLogo} alt={profile.club!} fill className="object-contain p-1.5" sizes="48px" />
                  ) : (
                    <span className="text-slate-400 font-extrabold text-lg">{profile.club?.substring(0, 1).toUpperCase() || '?'}</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-slate-900">{profile.club}</span>
                  {profile.category && <span className="text-xs font-bold text-slate-500">{profile.category}</span>}
                </div>
              </div>
            ) : (
              <p className="text-slate-400 font-medium mt-2 italic flex items-center gap-2">Agent libre</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-5">
              {profile.jersey_number && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">N° {profile.jersey_number}</span>}
              {profile.foot_preference && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">🦶 {profile.foot_preference}</span>}
              {profile.height && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">📏 {profile.height} cm</span>}
              {profile.weight && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">⚖️ {profile.weight} kg</span>}
            </div>
          </div>
        </header>

        <ProfileTabs userId={targetUserId} />
        
        {/* Contenu dynamique injecté ici (Saison Actuelle OU Carrière) */}
        {props.children}
      </main>
    </div>
  )
}