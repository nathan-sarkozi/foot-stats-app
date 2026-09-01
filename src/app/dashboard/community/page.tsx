import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'

export default async function CommunityPage() {
  const supabase = await createClient()

  // 1. Fetch directory
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name')

  if (error) {
    console.error('Directory Fetch Error:', error.message)
    return <div className="text-red-500 font-medium p-4 bg-red-50 rounded-lg">Erreur lors du chargement des joueurs.</div>
  }

  return (
    <div className="space-y-8">
      {/* Header modernisé */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between pt-2">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Communauté</h1>
          <p className="text-slate-500 mt-2 text-sm">Consultez les statistiques des autres joueurs</p>
        </div>
      </div>

      {/* Grille de joueurs avec design system actuel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles?.map((profile) => (
          <Link 
            key={profile.id} 
            href={`/profile/${profile.id}`}
            className="group relative bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex items-center justify-between overflow-hidden"
          >
            {/* Liseré indicateur au survol */}
            <div className="absolute left-0 top-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="flex items-center gap-4">
              {/* Avatar générique stylisé */}
              <div className="h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100 group-hover:scale-105 transition-transform">
                {profile.display_name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">
                  {profile.display_name}
                </p>
                <p className="text-xs font-medium text-slate-400">Voir le profil complet</p>
              </div>
            </div>
            
            <div className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}