import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import StatsChart from './components/StatsChart'
import CompetitionFilter from './components/CompetitionFilter'

interface PlayerProfile {
  username: string
  created_at: string
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
  matches: MatchInfo 
}

// CORRECTION ICI : Le composant StatCard est défini EN DEHORS de DashboardPage
const StatCard = ({ title, value, subtitle }: { title: string, value: string | number, subtitle?: string }) => (
  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-center">
    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</h3>
    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
  </div>
)

// Next 15 : searchParams est une Promise
export default async function DashboardPage(props: {
  searchParams: Promise<{ comps?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: playerProfile, error: profileError } = await supabase
    .from('players')
    .select('username, created_at')
    .eq('id', user.id)
    .single()

  if (profileError) return <div className="text-red-500">Erreur profil.</div>

  const { data: statsData, error: statsError } = await supabase
    .from('statistics')
    .select(`
      has_played, minutes_played, goals, assists, yellow_cards, red_cards,
      matches (id, match_date, opponent, team_score, opponent_score, competition_type)
    `)
    .eq('player_id', user.id)

  if (statsError) return <div className="text-red-500">Erreur stats.</div>

  const profile = playerProfile as PlayerProfile
  const allStats = statsData as unknown as StatRow[]

  // 1. FILTERING
  const activeComps = searchParams.comps ? searchParams.comps.split(',') : ['LEAGUE', 'CUP', 'FRIENDLY']
  const filteredStats = allStats.filter(stat => activeComps.includes(stat.matches.competition_type))

  // 2. SORTING (Descending for history)
  const sortedStats = [...filteredStats].sort((a, b) => {
    return new Date(b.matches.match_date).getTime() - new Date(a.matches.match_date).getTime()
  })

  // 3. ADVANCED MATHS & AGGREGATIONS
  const matchesPlayed = filteredStats.filter(s => s.has_played).length
  const totalGoals = filteredStats.reduce((sum, s) => sum + s.goals, 0)
  const totalAssists = filteredStats.reduce((sum, s) => sum + s.assists, 0)
  const totalMinutes = filteredStats.reduce((sum, s) => sum + s.minutes_played, 0)
  const totalYellows = filteredStats.reduce((sum, s) => sum + s.yellow_cards, 0)
  const totalReds = filteredStats.reduce((sum, s) => sum + s.red_cards, 0)
  
  // Derived Stats
  const totalGA = totalGoals + totalAssists
  const ratioGoalsPerMatch = matchesPlayed > 0 ? (totalGoals / matchesPlayed).toFixed(2) : '0.00'
  const ratioAssistsPerMatch = matchesPlayed > 0 ? (totalAssists / matchesPlayed).toFixed(2) : '0.00'
  const minsPerGoal = totalGoals > 0 ? Math.round(totalMinutes / totalGoals) : '-'
  const minsPerAssist = totalAssists > 0 ? Math.round(totalMinutes / totalAssists) : '-'

  // 4. CHART DATA (Ascending order)
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
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bon retour, {profile.username} !</h2>
          <p className="text-gray-500 mt-1">Voici ton récapitulatif détaillé.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link href="/dashboard/add-match" className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
            + Ajouter un match
          </Link>
        </div>
      </div>

      {/* Les Filtres */}
      <CompetitionFilter />

      {/* Grille de statistiques avancées */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Matchs Joués" value={matchesPlayed} subtitle={`${totalMinutes} minutes`} />
        <StatCard title="G/A (Impliqué)" value={totalGA} subtitle={`${totalGoals} B | ${totalAssists} P`} />
        <StatCard title="Ratio But/Match" value={ratioGoalsPerMatch} subtitle={`1 but / ${minsPerGoal} min`} />
        <StatCard title="Ratio Passe/Match" value={ratioAssistsPerMatch} subtitle={`1 passe / ${minsPerAssist} min`} />
        <StatCard title="Total Buts" value={totalGoals} />
        <StatCard title="Total Passes" value={totalAssists} />
        <StatCard title="Cartons Jaunes" value={totalYellows} subtitle="🟨" />
        <StatCard title="Cartons Rouges" value={totalReds} subtitle="🟥" />
      </div>

      {/* Analytics Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-6">Évolution des performances</h3>
        <StatsChart data={chartData} />
      </div>

      {/* Match History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900">Historique ({filteredStats.length})</h3>
        </div>
        <ul className="divide-y divide-gray-200">
          {sortedStats.map((stat) => {
            const match = stat.matches
            const dateStr = new Date(match.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
            const isWin = match.team_score > match.opponent_score
            const isLoss = match.team_score < match.opponent_score
            const resultColor = isWin ? 'bg-green-100 text-green-800' : isLoss ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'

            return (
              <li key={match.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="shrink-0 w-12 text-center">
                    <span className="text-sm text-gray-500 block">{dateStr}</span>
                    <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${resultColor}`}>
                      {match.team_score} - {match.opponent_score}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">contre {match.opponent}</p>
                    <p className="text-xs text-gray-500">{getCompetitionLabel(match.competition_type)}</p>
                  </div>
                </div>
                
                <div className="text-right flex items-center space-x-4">
                  {stat.has_played ? (
                    <div className="text-sm text-gray-700">
                      {stat.goals > 0 && <span className="font-bold text-green-600 mr-2">⚽ {stat.goals}</span>}
                      {stat.assists > 0 && <span className="font-bold text-blue-600 mr-2">👟 {stat.assists}</span>}
                      {stat.yellow_cards > 0 && <span className="mr-2" title="Cartons jaunes">🟨 {stat.yellow_cards}</span>}
                      {stat.red_cards > 0 && <span className="mr-2" title="Carton rouge">🟥 {stat.red_cards}</span>}
                      <span className="text-gray-500">{stat.minutes_played}&apos;</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400 italic mr-2">N&apos;a pas joué</span>
                  )}
                  
                  <Link href={`/dashboard/edit-match/${match.id}`} className="text-gray-400 hover:text-indigo-600 transition-colors">
                    ✏️ Modifier
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}