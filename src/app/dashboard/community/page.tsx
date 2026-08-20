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
    return <p className="text-red-500">Erreur lors du chargement des joueurs.</p>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Communauté</h1>
        <p className="text-gray-500 text-sm">Consultez les statistiques des autres joueurs.</p>
      </header>

      {/* 2. Render clickable player cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {profiles?.map((profile) => (
          <Link 
            key={profile.id} 
            href={`/profile/${profile.id}`}
            className="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-center">
              <p className="font-semibold text-lg text-gray-900">{profile.display_name}</p>
              <span className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                &rarr;
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}