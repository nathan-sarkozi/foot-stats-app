import type { MatchStatRecord, summarizeSeasonStats } from './playerStats'

// Presentation only: preserve the audited calculations, but never present a
// missing value (or a match without a statistics row) as a known zero.
export function seasonPresentation(summary: ReturnType<typeof summarizeSeasonStats>, matchCount: number) {
  const rows = summary.displayStats
  const completeRecords = rows.length > 0 && rows.length === matchCount
  const participationKnown = completeRecords && rows.every(row => row.has_played !== null)
  const playingKnown = (field: keyof MatchStatRecord) => participationKnown && rows.every(row => row.has_played === false || row[field] !== null)
  const goals = playingKnown('goals')
  const assists = playingKnown('assists')
  const minutes = playingKnown('minutes_played')
  const motm = playingKnown('is_motm')
  const position = playingKnown('position_played')
  const yellows = completeRecords && rows.every(row => row.yellow_cards !== null)
  const reds = completeRecords && rows.every(row => row.red_cards !== null)
  const wins = participationKnown && rows.every(row => row.has_played === false || (row.matches.team_score !== null && row.matches.opponent_score !== null))
  const known = { participation: participationKnown, goals, assists, minutes, motm, position, discipline: yellows && reds, wins, ga: goals && assists }
  let goalsUnknown = !completeRecords, assistsUnknown = !completeRecords
  const chartData = [...rows].reverse().map((row, index) => {
    if (row.has_played !== false) {
      goalsUnknown ||= row.has_played === null || row.goals === null
      assistsUnknown ||= row.has_played === null || row.assists === null
    }
    return { ...summary.chartData[index], goals: goalsUnknown ? null : summary.chartData[index].goals, assists: assistsUnknown ? null : summary.chartData[index].assists }
  })
  return { known, chartData, incomplete: matchCount > 0 && Object.values(known).some(value => !value) }
}
