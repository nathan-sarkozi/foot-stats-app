import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'

// 1. Mise à jour du typage strict pour Next.js 15+
interface ProfilePageProps {
  params: Promise<{
    userId: string
  }>
}

export default async function PublicProfilePage(props: ProfilePageProps) {
  const supabase = await createClient()
  
  // 2. On "await" la promesse des paramètres AVANT de l'utiliser
  const resolvedParams = await props.params
  const targetUserId = resolvedParams.userId

  // 1. Fetch statistics using the URL UUID
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

  // 2. Error handling: if user doesn't exist or DB fails, show 404
  if (error || !stats) {
    console.error('Fetch Error:', error?.message)
    return notFound()
  }

  // 3. Aggregate data
  const totalGoals = stats.reduce((acc, curr) => acc + (curr.goals || 0), 0)
  const totalAssists = stats.reduce((acc, curr) => acc + (curr.assists || 0), 0)
  const gamesPlayed = stats.length

  return (
    <main className="max-w-4xl mx-auto p-6">
      <header className="mb-8 border-b pb-4">
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

      {/* Match History (Read-only) */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Historique</h2>
        {gamesPlayed === 0 ? (
          <p className="text-gray-500 italic">Aucun match enregistré pour le moment.</p>
        ) : (
<div className="space-y-3">
            {stats.map((stat, index) => {
              // 1. Normalisation stricte : On gère l'inférence par défaut de Supabase
              // Si la jointure renvoie un tableau, on extrait l'objet. Sinon, on garde l'objet.
              const match = Array.isArray(stat.matches) ? stat.matches[0] : stat.matches

              // 2. Sécurité : Si le match a été supprimé ou est introuvable, on ignore cette ligne
              if (!match) return null

              return (
                <div key={index} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    {/* 3. Utilisation propre sur l'objet extrait */}
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
  )
}