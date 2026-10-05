import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image' // IMPORT LINK SUPPRIMÉ
import StatCard from '@/app/dashboard/components/StatCard'
import StatsChart from '@/app/dashboard/components/StatsChart'
import { getClubLogo } from '@/utils/getClubLogo'

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
    id: string
    match_date: string
    opponent: string
    team_score: number
    opponent_score: number
    competition_type: 'LEAGUE' | 'CUP' | 'FRIENDLY'
  }
}

export default async function CurrentSeasonPage(props: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient()
  const targetUserId = (await props.params).userId

  const { data: statsData, error: statsError } = await supabase
    .from('statistics')
    .select(`
      goals, assists, yellow_cards, red_cards, minutes_played, has_played, is_motm, position_played,
      matches!inner ( id, opponent, match_date, competition_type, team_score, opponent_score )
    `)
    .eq('player_id', targetUserId)
    .returns<MatchStatRecord[]>()

  if (statsError || !statsData) return notFound()

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
  
  const displayStats = [...sortedStatsAsc].reverse()

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
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
            {displayStats.map((stat) => {
              const match = stat.matches
              const dateStr = new Date(match.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
              const isWin = match.team_score > match.opponent_score
              const isLoss = match.team_score < match.opponent_score
              const resultColor = isWin ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isLoss ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-800 border-slate-200'
              
              const opponentLogo = getClubLogo(match.opponent)

              return (
                <div key={match.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4 sm:space-x-6">
                    
                    {/* CORRECTION TAILWIND: min-w-[64px] -> min-w-16 */}
                    <div className="shrink-0 text-center min-w-16">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{dateStr}</span>
                      <span className={`mt-1.5 flex w-full items-center justify-center px-2 py-1.5 rounded-lg text-sm font-black border ${resultColor}`}>
                        {match.team_score} - {match.opponent_score}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="relative w-12 h-12 shrink-0 bg-slate-50 rounded-full border border-slate-100 shadow-sm flex items-center justify-center overflow-hidden">
                        {opponentLogo ? (
                          <Image src={opponentLogo} alt={match.opponent} fill className="object-contain p-2" sizes="48px" />
                        ) : (
                          <span className="text-slate-400 font-extrabold text-lg">{match.opponent.substring(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-slate-900">{match.opponent}</p>
                          {stat.is_motm && <span title="Homme du Match" className="text-lg">🏆</span>}
                        </div>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">{getCompetitionLabel(match.competition_type)}</p>
                      </div>
                    </div>

                  </div>
                  
                  <div className="flex items-center flex-wrap gap-2 pt-4 sm:pt-0 border-t sm:border-0 border-slate-100">
                    {stat.has_played ? (
                      <>
                        {stat.position_played && <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-black uppercase border border-slate-200">{stat.position_played}</span>}
                        {stat.goals > 0 && <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold border border-emerald-100">⚽ {stat.goals}</span>}
                        {stat.assists > 0 && <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-bold border border-indigo-100">👟 {stat.assists}</span>}
                        {stat.yellow_cards > 0 && <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md text-xs font-bold border border-amber-100">🟨 {stat.yellow_cards}</span>}
                        {stat.red_cards > 0 && <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-md text-xs font-bold border border-red-100">🟥 {stat.red_cards}</span>}
                        <span className="text-slate-400 font-semibold text-sm ml-2">{stat.minutes_played}&apos;</span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">N&apos;a pas joué</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}