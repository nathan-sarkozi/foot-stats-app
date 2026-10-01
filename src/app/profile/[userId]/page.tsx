import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Navbar from '@/app/dashboard/components/Navbar'
import StatCard from '@/app/dashboard/components/StatCard'
import StatsChart from '@/app/dashboard/components/StatsChart'
import FormGuide from '@/app/dashboard/components/FormGuide'

interface MatchStatRecord {
  has_played: boolean
  minutes_played: number
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  is_motm: boolean
  position_played: string | null
  matches: {
    match_date: string
    opponent: string
    team_score: number
    opponent_score: number
    competition_type: 'LEAGUE' | 'CUP' | 'FRIENDLY'
  }
}

export default async function PublicProfilePage(props: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient()
  const targetUserId = (await props.params).userId

  // 1. GESTION DU VISITEUR (Pour la Navbar en haut à droite)
  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  let visitorInitials = "FS"
  let visitorAvatarUrl = null

  if (authUser) {
    const { data: visitorProfile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', authUser.id)
      .single()
      
    if (visitorProfile && visitorProfile.display_name) {
      visitorInitials = visitorProfile.display_name.substring(0, 2).toUpperCase()
      visitorAvatarUrl = visitorProfile.avatar_url
    }
  }

  // 2. GESTION DU JOUEUR VISITÉ (Pour le contenu de la page)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, club, category, preferred_position, foot_preference, jersey_number, height, weight')
    .eq('id', targetUserId)
    .single()

  if (profileError || !profile) return notFound()

  // 3. RÉCUPÉRATION DES STATISTIQUES DU JOUEUR VISITÉ
  const { data: statsData, error: statsError } = await supabase
    .from('statistics')
    .select(`
      goals, assists, yellow_cards, red_cards, minutes_played, has_played, is_motm, position_played,
      matches!inner ( opponent, match_date, competition_type, team_score, opponent_score )
    `)
    .eq('player_id', targetUserId)
    .returns<MatchStatRecord[]>()

  if (statsError || !statsData) return notFound()

  // CALCULS ALGORITHMIQUES O(N)
  let matchesPlayed = 0
  let totalGoals = 0
  let totalAssists = 0
  let totalMinutes = 0
  let totalYellows = 0
  let totalReds = 0
  let totalMotm = 0
  let totalWins = 0
  const positionCounts: Record<string, number> = {}
  
  const chartData: Array<{ date: string; goals: number; assists: number; opponent: string }> = []
  
  // Tri chronologique ascendant requis pour le graphique
  const sortedStatsAsc = [...statsData].sort((a, b) => 
    new Date(a.matches.match_date).getTime() - new Date(b.matches.match_date).getTime()
  )

  for (const stat of sortedStatsAsc) {
    if (stat.has_played) {
      matchesPlayed++
      totalGoals += stat.goals
      totalAssists += stat.assists
      totalMinutes += stat.minutes_played
      totalYellows += stat.yellow_cards
      totalReds += stat.red_cards
      if (stat.is_motm) totalMotm++
      if (stat.matches.team_score > stat.matches.opponent_score) totalWins++
      
      if (stat.position_played) {
        positionCounts[stat.position_played] = (positionCounts[stat.position_played] || 0) + 1
      }
    }

    chartData.push({
      date: new Date(stat.matches.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      goals: totalGoals,
      assists: totalAssists,
      opponent: stat.matches.opponent
    })
  }

  let favPosition = 'N/A'
  let maxPosCount = 0
  for (const [pos, count] of Object.entries(positionCounts)) {
    if (count > maxPosCount) {
      maxPosCount = count
      favPosition = pos
    }
  }

  const totalGA = totalGoals + totalAssists
  const winRate = matchesPlayed > 0 ? Math.round((totalWins / matchesPlayed) * 100) : 0
  const minsPerGoal = totalGoals > 0 ? Math.round(totalMinutes / totalGoals) : 0

  const getCompetitionLabel = (type: string) => {
    const labels: Record<string, string> = { LEAGUE: 'Championnat', CUP: 'Coupe', FRIENDLY: 'Amical' }
    return labels[type] || type
  }
  
  // Inversion pour l'affichage de l'historique (du plus récent au plus ancien)
  const displayStats = [...sortedStatsAsc].reverse()

  return (
    <div className="min-h-screen bg-slate-50">
      
      {/* CORRECTION : Hydratation de la Navbar avec les données du VISITEUR */}
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
              <Image src={profile.avatar_url} alt={`Avatar de ${profile.display_name}`} fill className="object-cover" sizes="96px" />
            ) : (
              profile.display_name.substring(0, 2).toUpperCase()
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{profile.display_name}</h1>
              {profile.preferred_position && (
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider rounded-lg border border-indigo-100">
                  {profile.preferred_position}
                </span>
              )}
            </div>
            
            {(profile.club || profile.category) ? (
              <p className="text-slate-600 font-medium mt-2 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
                {profile.club || 'Club non renseigné'} {profile.category && <span className="text-slate-400">• {profile.category}</span>}
              </p>
            ) : (
              <p className="text-slate-400 font-medium mt-2 italic flex items-center gap-2">Agent libre</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {profile.jersey_number && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">N° {profile.jersey_number}</span>}
              {profile.foot_preference && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">🦶 {profile.foot_preference}</span>}
              {profile.height && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">📏 {profile.height} cm</span>}
              {profile.weight && <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">⚖️ {profile.weight} kg</span>}
            </div>
            
            <div className="mt-5 border-t border-slate-100 pt-4">
              <FormGuide recentMatches={displayStats.filter(stat => stat.has_played).map(stat => stat.matches)} />
            </div>

          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          <StatCard title="Matchs Joués" value={matchesPlayed} subtitle={`${totalMinutes} min cumulées`} delay={0.1} highlight />
          <StatCard title="G/A (Impliqué)" value={totalGA} subtitle={`${totalGoals} B | ${totalAssists} P`} delay={0.2} highlight />
          <StatCard title="Total Buts" value={totalGoals} subtitle={minsPerGoal > 0 ? `1 but / ${minsPerGoal} min` : '0 but'} delay={0.3} />
          <StatCard title="Total Passes" value={totalAssists} subtitle={`${totalGoals > 0 ? (totalAssists/matchesPlayed).toFixed(2) : 0} par match`} delay={0.4} />
          
          <StatCard title="Ratio Victoires" value={`${winRate}%`} subtitle={`${totalWins} V en ${matchesPlayed} M`} delay={0.5} />
          <StatCard title="Homme du Match" value={totalMotm} subtitle="Trophées 🏆" delay={0.6} />
          <StatCard title="Poste le plus joué" value={favPosition} subtitle={`${maxPosCount} apparitions`} delay={0.7} />
          <StatCard title="Discipline" value={totalYellows + totalReds} subtitle={`${totalYellows} 🟨 | ${totalReds} 🟥`} delay={0.8} />
        </div>

        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-6 tracking-tight">Impact Offensif de la Saison</h3>
          <StatsChart data={chartData} />
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Historique des matchs</h2>
          
          {matchesPlayed === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-dashed border-slate-300 text-center text-slate-500">
              Aucun match enregistré pour le moment.
            </div>
          ) : (
            <div className="space-y-3">
              {displayStats.map((stat, index) => {
                const match = stat.matches
                const dateStr = new Date(match.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                const isWin = match.team_score > match.opponent_score
                const isLoss = match.team_score < match.opponent_score
                const resultColor = isWin ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isLoss ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-800 border-slate-200'

                return (
                  <div key={index} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-5">
                      <div className="shrink-0 text-center min-w-12">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">{dateStr}</span>
                        <span className={`mt-1.5 inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold border ${resultColor}`}>
                          {match.team_score} - {match.opponent_score}
                        </span>
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-slate-900">vs {match.opponent}</p>
                          {stat.is_motm && <span title="Homme du Match" className="text-lg">🏆</span>}
                        </div>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">{getCompetitionLabel(match.competition_type)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center flex-wrap gap-2 pt-4 sm:pt-0 border-t sm:border-0 border-slate-100">
                      {stat.has_played ? (
                        <>
                          {stat.position_played && <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold border border-slate-200">{stat.position_played}</span>}
                          {stat.goals > 0 && <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-bold border border-emerald-100">⚽ {stat.goals}</span>}
                          {stat.assists > 0 && <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">👟 {stat.assists}</span>}
                          {stat.yellow_cards > 0 && <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs font-bold border border-amber-100">🟨 {stat.yellow_cards}</span>}
                          {stat.red_cards > 0 && <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs font-bold border border-red-100">🟥 {stat.red_cards}</span>}
                          <span className="text-slate-400 font-medium text-sm ml-2">{stat.minutes_played}&apos;</span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-slate-400 bg-slate-50 px-3 py-1 rounded-full">N&apos;a pas joué</span>
                      )}
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