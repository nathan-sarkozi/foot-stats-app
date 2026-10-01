import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import Image from 'next/image'

interface ProfileData {
  id: string
  display_name: string
  avatar_url: string | null
  club: string | null
  category: string | null
  preferred_position: string | null
}

export default async function CommunityPage() {
  const supabase = await createClient()

  // FIX: Ajout de avatar_url dans la clause select
  const { data: profilesData, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, club, category, preferred_position')
    .order('display_name', { ascending: true })
    .limit(50)
    .returns<ProfileData[]>()

  if (error) {
    console.error('Directory Fetch Error:', error.message)
    return <div className="text-red-500 font-medium p-4 bg-red-50 rounded-lg">Erreur lors du chargement des joueurs.</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between pt-2">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Communauté</h1>
          <p className="text-slate-500 mt-2 text-sm">Consultez les statistiques des autres joueurs (50 premiers max).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {profilesData?.map((profile) => (
          <Link 
            key={profile.id} 
            href={`/profile/${profile.id}`}
            className="group relative bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between overflow-hidden min-h-35"
          >
            <div className="absolute left-0 top-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                
                {/* FIX: Conteneur d'avatar avec support Image Next.js */}
                <div className="h-12 w-12 shrink-0 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100 group-hover:scale-105 transition-transform overflow-hidden relative">
                  {profile.avatar_url ? (
                    <Image 
                      src={profile.avatar_url} 
                      alt={`Avatar de ${profile.display_name}`} 
                      fill 
                      className="object-cover" 
                      sizes="48px" 
                    />
                  ) : (
                    profile.display_name.substring(0, 2).toUpperCase()
                  )}
                </div>

                <div>
                  <p className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">
                    {profile.display_name}
                  </p>
                  {(profile.club || profile.category) ? (
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      {profile.club} {profile.category && `• ${profile.category}`}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-slate-400 mt-0.5 italic">Agent libre</p>
                  )}
                </div>
              </div>

              {profile.preferred_position && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-md border border-slate-200">
                  {profile.preferred_position}
                </span>
              )}
            </div>
            
            <div className="mt-4 flex items-center justify-end text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all">
              <span className="text-xs font-semibold mr-2 opacity-0 group-hover:opacity-100 transition-opacity">Voir le profil</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}