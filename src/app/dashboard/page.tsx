import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import StatsChart from './components/StatsChart'
import CompetitionFilter from './components/CompetitionFilter'
import StatCard from './components/StatCard'
import { redirect } from 'next/navigation'

// 1. MISE À JOUR DE L'INTERFACE : On passe sur display_name
interface PlayerProfile {
  display_name: string
}

interface MatchInfo {
  id: string
  match_date: string
  opponent: string
  team_score: number
  opponent_score: number
  competition_type: 'LEAGUE' | 'CUP' | 'FRIENDLY'
}

interface StatRow {
  has_played: boolean
  minutes_played: number
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  is_motm: boolean
  position_played: string | null
  matches: MatchInfo 
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ comps?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 2. MISE À JOUR DE LA REQUÊTE : On tape dans 'profiles' au lieu de 'players'
  const { data: playerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error("Erreur Fetch Profil:", profileError.message)
    return <div className="text-red-500 p-4 font-bold bg-red-50 rounded-lg">Erreur profil : {profileError.message}</div>
  }

  const { data: statsData, error: statsError } = await supabase
    .from('statistics')
    .select(`
      has_played, minutes_played, goals, assists, yellow_cards, red_cards, is_motm, position_played,
      matches (id, match_date, opponent, team_score, opponent_score, competition_type)
    `)
    .eq('player_id', user.id)

  if (statsError) return <div className="text-red-500">Erreur stats.</div>

  const profile = playerProfile as PlayerProfile
  const allStats = statsData as unknown as StatRow[]

  // FILTERING
  const activeComps = searchParams.comps ? searchParams.comps.split(',') : ['LEAGUE', 'CUP', 'FRIENDLY']
  const filteredStats = allStats.filter(stat => activeComps.includes(stat.matches.competition_type))

  // SORTING
  const sortedStats = [...filteredStats].sort((a, b) => {
    return new Date(b.matches.match_date).getTime() - new Date(a.matches.match_date).getTime()
  })

  // MATHS & AGGREGATIONS
  const matchesPlayed = filteredStats.filter(s => s.has_played).length
  const totalGoals = filteredStats.reduce((sum, s) => sum + s.goals, 0)
  const totalAssists = filteredStats.reduce((sum, s) => sum + s.assists, 0)
  const totalMinutes = filteredStats.reduce((sum, s) => sum + s.minutes_played, 0)
  const totalYellows = filteredStats.reduce((sum, s) => sum + s.yellow_cards, 0)
  const totalReds = filteredStats.reduce((sum, s) => sum + s.red_cards, 0)
  const totalMotm = filteredStats.filter(s => s.is_motm).length
  
  const positionCounts = filteredStats.reduce((acc, stat) => {
    if (stat.position_played) {
      acc[stat.position_played] = (acc[stat.position_played] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  let favPosition = 'N/A'
  let maxPosCount = 0
  for (const [pos, count] of Object.entries(positionCounts)) {
    if (count > maxPosCount) {
      maxPosCount = count
      favPosition = pos
    }
  }

  const totalGA = totalGoals + totalAssists
  const p90Goals = totalMinutes > 0 ? ((totalGoals / totalMinutes) * 90).toFixed(2) : '0.00'
  const p90Assists = totalMinutes > 0 ? ((totalAssists / totalMinutes) * 90).toFixed(2) : '0.00'

  // CHART DATA
  const chartData = [...sortedStats].reverse().reduce((acc, stat) => {
    const prevG = acc.length > 0 ? acc[acc.length - 1].goals : 0
    const prevA = acc.length > 0 ? acc[acc.length - 1].assists : 0
    const prevY = acc.length > 0 ? acc[acc.length - 1].yellow_cards : 0
    const prevR = acc.length > 0 ? acc[acc.length - 1].red_cards : 0

    acc.push({
      date: new Date(stat.matches.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      goals: prevG + stat.goals,
      assists: prevA + stat.assists,
      yellow_cards: prevY + (stat.yellow_cards || 0),
      red_cards: prevR + (stat.red_cards || 0),
      opponent: stat.matches.opponent
    })
    return acc
  }, [] as Array<{ date: string; goals: number; assists: number; yellow_cards: number; red_cards: number; opponent: string }>)

  const getCompetitionLabel = (type: string) => {
    if (type === 'LEAGUE') return 'Championnat'
    if (type === 'CUP') return 'Coupe'
    if (type === 'FRIENDLY') return 'Amical'
    return type
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between pt-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vue d&apos;ensemble</h2>
          {/* 3. MISE À JOUR DE L'AFFICHAGE : On utilise display_name */}
          <p className="text-slate-500 mt-2 text-sm">Analyse des performances de {profile.display_name}.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link href="/dashboard/add-match" className="inline-flex items-center px-4 py-2 rounded-full shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95">
            + Ajouter un match
          </Link>
        </div>
      </div>

      <CompetitionFilter />

      {/* Grille de statistiques avec Framer Motion */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <StatCard title="Poste le plus joué" value={favPosition} subtitle={`${maxPosCount} matchs joués`} delay={0.1} highlight />
        <StatCard title="Homme du Match" value={totalMotm} subtitle="Trophées 🏆" delay={0.2} highlight />
        <StatCard title="Matchs Joués" value={matchesPlayed} subtitle={`${totalMinutes} min cumulées`} delay={0.3} />
        <StatCard title="G/A (Impliqué)" value={totalGA} subtitle={`${totalGoals} B | ${totalAssists} P`} delay={0.4} />
        
        <StatCard title="Total Buts" value={totalGoals} subtitle={`${p90Goals} Buts / 90 min`} delay={0.5} />
        <StatCard title="Total Passes" value={totalAssists} subtitle={`${p90Assists} Passes / 90 min`} delay={0.6} />
        <StatCard title="Cartons Jaunes" value={totalYellows} subtitle="🟨 Avertissements" delay={0.7} />
        <StatCard title="Cartons Rouges" value={totalReds} subtitle="🟥 Expulsions" delay={0.8} />
      </div>

      {/* Analytics Section */}
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-6 tracking-tight">Évolution de la saison</h3>
        <StatsChart data={chartData} />
      </div>

      {/* Match History */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Historique des matchs ({filteredStats.length})</h3>
        
        {sortedStats.length === 0 ? (
           <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center text-slate-500">
             Aucun match enregistré avec ces filtres.
           </div>
        ) : (
          <div className="space-y-3">
            {sortedStats.map((stat) => {
              const match = stat.matches
              const dateStr = new Date(match.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
              const isWin = match.team_score > match.opponent_score
              const isLoss = match.team_score < match.opponent_score
              const resultColor = isWin ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isLoss ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-800 border-slate-200'

              return (
                <div key={match.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                  
                  <div className="flex items-center space-x-5">
                    <div className="shrink-0 text-center min-w-12">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">{dateStr}</span>
                      <span className={`mt-1.5 inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold border ${resultColor}`}>
                        {match.team_score} - {match.opponent_score}
                      </span>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">vs {match.opponent}</p>
                        {stat.is_motm && <span title="Homme du Match" className="text-lg">🏆</span>}
                      </div>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">{getCompetitionLabel(match.competition_type)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 pt-4 sm:pt-0 border-t sm:border-0 border-slate-100">
                    {stat.has_played ? (
                      <div className="flex items-center flex-wrap gap-2">
                        {stat.position_played && (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold border border-slate-200">
                            {stat.position_played}
                          </span>
                        )}
                        {stat.goals > 0 && <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-bold border border-emerald-100">⚽ {stat.goals}</span>}
                        {stat.assists > 0 && <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">👟 {stat.assists}</span>}
                        {stat.yellow_cards > 0 && <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs font-bold border border-amber-100">🟨 {stat.yellow_cards}</span>}
                        {stat.red_cards > 0 && <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs font-bold border border-red-100">🟥 {stat.red_cards}</span>}
                        <span className="text-slate-400 font-medium text-sm ml-2">{stat.minutes_played}&apos;</span>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-slate-400 bg-slate-50 px-3 py-1 rounded-full">N&apos;a pas joué</span>
                    )}
                    
                    <Link href={`/dashboard/edit-match/${match.id}`} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </Link>
                  </div>
                  
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}