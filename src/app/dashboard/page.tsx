import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import StatsChart from './components/StatsChart'
import CompetitionFilter from './components/CompetitionFilter'
import StatCard from './components/StatCard'
import FormGuide from './components/FormGuide'
import { redirect } from 'next/navigation'
import { getClubLogo } from '@/utils/getClubLogo'
import TeamWidget from './components/TeamWidget'

interface PlayerProfile {
  display_name: string
  rbfa_team_id: string | null // TYPAGE STRICT CORRIGÉ
}

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

export default async function DashboardPage(props: { searchParams: Promise<{ comps?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: playerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, rbfa_team_id')
    .eq('id', user.id)
    .single()

  if (profileError) return <div className="text-red-500 p-4 font-bold bg-red-50 rounded-lg">Error: {profileError.message}</div>

  const { data: statsData, error: statsError } = await supabase
    .from('statistics')
    .select(`
      has_played, minutes_played, goals, assists, yellow_cards, red_cards, is_motm, position_played,
      matches!inner (id, match_date, opponent, team_score, opponent_score, competition_type)
    `)
    .eq('player_id', user.id)
    .returns<MatchStatRecord[]>()

  if (statsError || !statsData) return <div className="text-red-500">Failed to load statistics.</div>

  const profile = playerProfile as PlayerProfile
  const activeComps = searchParams.comps ? searchParams.comps.split(',') : ['LEAGUE', 'CUP', 'FRIENDLY']
  
  let matchesPlayed = 0
  let totalGoals = 0
  let totalAssists = 0
  let totalMinutes = 0
  let totalYellows = 0
  let totalReds = 0
  let totalMotm = 0
  let totalWins = 0
  
  const positionCounts: Record<string, number> = {}
  const filteredStats: MatchStatRecord[] = []
  const chartData: Array<{ date: string; goals: number; assists: number; opponent: string }> = []

  const sortedByDateAsc = [...statsData].sort((a, b) => 
    new Date(a.matches.match_date).getTime() - new Date(b.matches.match_date).getTime()
  )

  for (const stat of sortedByDateAsc) {
    if (!activeComps.includes(stat.matches.competition_type)) continue

    filteredStats.push(stat)

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
  
  const displayStats = [...filteredStats].reverse()

  const getCompetitionLabel = (type: string) => {
    const labels: Record<string, string> = { LEAGUE: 'Championnat', CUP: 'Coupe', FRIENDLY: 'Amical' }
    return labels[type] || type
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between pt-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vue d&apos;ensemble</h2>
          <div className="mt-3 flex items-center gap-4">
            <p className="text-slate-500 text-sm">Analyse des performances de {profile.display_name}.</p>
            <FormGuide recentMatches={displayStats.filter(stat => stat.has_played).map(stat => stat.matches)} />
          </div>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link href="/dashboard/add-match" className="inline-flex items-center px-4 py-2 rounded-full shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95">
            + Ajouter un match
          </Link>
        </div>
      </div>

      <TeamWidget teamId={profile.rbfa_team_id} isDashboard={true} />

      <CompetitionFilter />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <StatCard title="Matchs Joués" value={matchesPlayed} subtitle={`${totalMinutes} min cumulées`} delay={0.1} highlight />
        <StatCard title="G/A (Impliqué)" value={totalGA} subtitle={`${totalGoals} B | ${totalAssists} P`} delay={0.2} highlight />
        <StatCard title="Total Buts" value={totalGoals} subtitle={minsPerGoal > 0 ? `1 but / ${minsPerGoal} min` : '0 but'} delay={0.3} />
        <StatCard title="Total Passes" value={totalAssists} subtitle={`${totalGoals > 0 ? (totalAssists/matchesPlayed).toFixed(2) : 0} par match`} delay={0.4} />
        
        <StatCard title="Ratio Victoires" value={`${winRate}%`} subtitle={`${totalWins} V en ${matchesPlayed} M`} delay={0.5} />
        <StatCard title="Homme du Match" value={totalMotm} subtitle="Trophées 🏆" delay={0.6} />
        <StatCard title="Poste le plus joué" value={favPosition} subtitle={`${maxPosCount} apparitions`} delay={0.7} />
        <StatCard title="Discipline" value={totalYellows + totalReds} subtitle={`${totalYellows} 🟨 | ${totalReds} 🟥`} delay={0.8} />
      </div>

      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-6 tracking-tight">Impact Offensif de la Saison</h3>
        <StatsChart data={chartData} />
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Historique des matchs ({displayStats.length})</h3>
        {displayStats.length === 0 ? (
           <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center text-slate-500">
             Aucun match enregistré avec ces filtres.
           </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {displayStats.map((stat) => {
              const match = stat.matches
              const dateStr = new Date(match.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
              const isWin = match.team_score > match.opponent_score
              const isLoss = match.team_score < match.opponent_score
              const resultColor = isWin ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isLoss ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-800 border-slate-200'
              const opponentLogo = getClubLogo(match.opponent)

              return (
                <Link 
                  key={match.id} 
                  href={`/dashboard/edit-match/${match.id}`}
                  className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-300 hover:-translate-y-0.5 sm:hover:-translate-y-1 transition-all group flex flex-col focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <div className="hidden sm:flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{dateStr}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">{getCompetitionLabel(match.competition_type)}</span>
                  </div>
                  
                  <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-0">
                    <div className="sm:hidden flex flex-col items-center justify-center min-w-10 pr-3 border-r border-slate-100">
                      <span className="text-sm font-black text-slate-700">{new Date(match.match_date).getDate()}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(match.match_date).toLocaleDateString('fr-FR', {month: 'short'})}</span>
                    </div>

                    <div className="relative w-10 h-10 sm:w-16 sm:h-16 shrink-0 bg-slate-50 sm:bg-white rounded-full border border-slate-100 shadow-sm flex items-center justify-center overflow-hidden sm:mb-3 group-hover:scale-105 transition-transform">
                      {opponentLogo ? (
                        <Image src={opponentLogo} alt={match.opponent} fill className="object-contain p-1.5 sm:p-2.5" sizes="(max-width: 640px) 40px, 64px" />
                      ) : (
                        <span className="text-slate-300 font-extrabold text-lg sm:text-2xl">{match.opponent.substring(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    
                    <div className="flex flex-col sm:items-center flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 sm:text-center sm:mb-3 group-hover:text-indigo-600 transition-colors truncate w-full" title={match.opponent}>
                        {match.opponent}
                      </p>
                      <div className="sm:hidden flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-semibold text-slate-500">{getCompetitionLabel(match.competition_type)}</span>
                        {stat.is_motm && <span className="text-[10px]" title="Homme du Match">🏆</span>}
                      </div>
                    </div>
                    
                    <div className="shrink-0 sm:w-full sm:flex sm:justify-center">
                      <span className={`flex items-center justify-center px-2.5 py-1 sm:px-5 sm:py-1.5 rounded-lg sm:rounded-xl text-sm sm:text-xl font-black border ${resultColor}`}>
                        {match.team_score} - {match.opponent_score}
                      </span>
                    </div>

                    {stat.is_motm && (
                      <div className="hidden sm:flex mt-3 text-[10px] font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 items-center gap-1.5 shadow-sm">
                        <span className="text-sm">🏆</span> Homme du Match
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-100 flex items-center justify-between sm:justify-center flex-wrap gap-2">
                    {stat.has_played ? (
                      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 w-full sm:w-auto justify-between sm:justify-center">
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {stat.position_played && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-100 text-slate-600 rounded text-[9px] sm:text-[10px] font-black uppercase border border-slate-200">{stat.position_played}</span>}
                          {stat.goals > 0 && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-emerald-50 text-emerald-700 rounded text-[9px] sm:text-[10px] font-bold border border-emerald-100">⚽ {stat.goals}</span>}
                          {stat.assists > 0 && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-indigo-50 text-indigo-700 rounded text-[9px] sm:text-[10px] font-bold border border-indigo-100">👟 {stat.assists}</span>}
                          {stat.yellow_cards > 0 && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-amber-50 text-amber-700 rounded text-[9px] sm:text-[10px] font-bold border border-amber-100">🟨 {stat.yellow_cards}</span>}
                          {stat.red_cards > 0 && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-50 text-red-700 rounded text-[9px] sm:text-[10px] font-bold border border-red-100">🟥 {stat.red_cards}</span>}
                        </div>
                        <span className="text-slate-400 font-bold text-[10px] sm:text-xs ml-auto sm:ml-1">{stat.minutes_played}&apos;</span>
                      </div>
                    ) : (
                      <span className="text-[10px] sm:text-xs font-semibold text-slate-400 bg-slate-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-slate-100 mx-auto">N&apos;a pas joué</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}