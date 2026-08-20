import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'

// Strict typing for Next.js 15+ dynamic route parameters
interface ProfilePageProps {
  params: Promise<{
    userId: string
  }>
}

export default async function PublicProfilePage(props: ProfilePageProps) {
  const supabase = await createClient()
  
  // Resolve params promise before accessing properties
  const resolvedParams = await props.params
  const targetUserId = resolvedParams.userId

  // Fetch statistics and joined matches
  const { data: stats, error } = await supabase
    .from('statistics')
    .select(`
      goals,
      assists,
      yellow_cards,
      red_cards,
      matches ( opponent, match_date, competition_type )
    `)
    .eq('player_id', targetUserId)

  if (error || !stats) {
    console.error('Fetch Error:', error?.message)
    return notFound()
  }

  // Aggregate data
  const totalGoals = stats.reduce((acc, curr) => acc + (curr.goals || 0), 0)
  const totalAssists = stats.reduce((acc, curr) => acc + (curr.assists || 0), 0)
  const gamesPlayed = stats.length

  return (
    // Wrapper div to enforce light mode background and fix contrast issues
    <div className="min-h-screen bg-gray-50 py-8">
      <main className="max-w-4xl mx-auto p-6">
        
        {/* Navigation back button */}
        <div className="mb-6">
          <Link 
            href="/dashboard/community" 
            className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            &larr; Retour à la communauté
          </Link>
        </div>

        <header className="mb-8 border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">Profil Joueur</h1>
          <p className="text-gray-500 text-xs mt-1 break-all">ID: {targetUserId}</p>
        </header>

        {/* Stats Overview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-500 uppercase">Matchs Joués</p>
            <p className="text-4xl font-bold text-indigo-600 mt-2">{gamesPlayed}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-500 uppercase">Buts</p>
            <p className="text-4xl font-bold text-emerald-600 mt-2">{totalGoals}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-500 uppercase">Passes D.</p>
            <p className="text-4xl font-bold text-blue-600 mt-2">{totalAssists}</p>
          </div>
        </section>

        {/* Match History */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Historique</h2>
          {gamesPlayed === 0 ? (
            <p className="text-gray-500 italic">Aucun match enregistré pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {stats.map((stat, index) => {
                // Safely extract the match object whether Supabase returns an array or an object
                const match = Array.isArray(stat.matches) ? stat.matches[0] : stat.matches

                if (!match) return null

                return (
                  <div key={index} className="flex justify-between items-center p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div>
                      <p className="font-medium text-gray-900">vs {match.opponent}</p>
                      <p className="text-xs text-gray-500">{match.match_date} • {match.competition_type}</p>
                    </div>
                    <div className="flex gap-3 text-sm font-medium">
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded">⚽ {stat.goals}</span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">👟 {stat.assists}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}