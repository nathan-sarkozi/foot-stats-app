export interface MatchStatRecord {
  has_played: boolean | null
  minutes_played: number | null
  goals: number | null
  assists: number | null
  yellow_cards: number | null
  red_cards: number | null
  is_motm: boolean | null
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

export interface Season {
  startYear: number
  endYear: number
  startDate: string
  endDate: string
}

// Football seasons follow the July boundary already used by the career page.
export function getCurrentSeason(now = new Date()): Season {
  const year = now.getFullYear()
  const startYear = now.getMonth() >= 6 ? year : year - 1

  return {
    startYear,
    endYear: startYear + 1,
    startDate: `${startYear}-07-01`,
    endDate: `${startYear + 1}-07-01`,
  }
}

export function summarizeSeasonStats(
  stats: readonly MatchStatRecord[],
  season: Season,
  activeComps: readonly string[] = ['LEAGUE', 'CUP', 'FRIENDLY'],
) {
  const sortedStats = stats
    .filter(stat => (
      stat.matches.match_date >= season.startDate
      && stat.matches.match_date < season.endDate
      && activeComps.includes(stat.matches.competition_type)
    ))
    .sort((a, b) => a.matches.match_date.localeCompare(b.matches.match_date))

  let matchesPlayed = 0
  let totalGoals = 0
  let totalAssists = 0
  let totalMinutes = 0
  let totalYellows = 0
  let totalReds = 0
  let totalMotm = 0
  let totalWins = 0
  const positionCounts: Record<string, number> = {}
  const chartData: Array<{
    date: string
    goals: number
    assists: number
    opponent: string
  }> = []

  for (const stat of sortedStats) {
    // A substitute may receive cards without participating in the match.
    totalYellows += stat.yellow_cards ?? 0
    totalReds += stat.red_cards ?? 0

    if (stat.has_played) {
      matchesPlayed++
      totalGoals += stat.goals ?? 0
      totalAssists += stat.assists ?? 0
      totalMinutes += stat.minutes_played ?? 0
      if (stat.is_motm) totalMotm++
      if (stat.matches.team_score > stat.matches.opponent_score) totalWins++
      if (stat.position_played) {
        positionCounts[stat.position_played] = (positionCounts[stat.position_played] ?? 0) + 1
      }
    }

    chartData.push({
      date: new Date(stat.matches.match_date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short',
      }),
      goals: totalGoals,
      assists: totalAssists,
      opponent: stat.matches.opponent,
    })
  }

  let favPosition = 'N/A'
  let maxPosCount = 0
  for (const [position, count] of Object.entries(positionCounts)) {
    if (count > maxPosCount) {
      maxPosCount = count
      favPosition = position
    }
  }

  const minsPerGoal = totalGoals > 0 ? Math.round(totalMinutes / totalGoals) : 0

  return {
    matchesPlayed,
    totalGoals,
    totalAssists,
    totalMinutes,
    totalYellows,
    totalReds,
    totalMotm,
    totalWins,
    favPosition,
    maxPosCount,
    totalGA: totalGoals + totalAssists,
    winRate: matchesPlayed > 0 ? Math.round(totalWins / matchesPlayed * 100) : 0,
    minsPerGoal,
    assistsPerMatch: matchesPlayed > 0 ? (totalAssists / matchesPlayed).toFixed(2) : '0',
    goalSubtitle: totalGoals > 0 ? `1 but / ${minsPerGoal} min` : '0 but',
    chartData,
    displayStats: [...sortedStats].reverse(),
  }
}
