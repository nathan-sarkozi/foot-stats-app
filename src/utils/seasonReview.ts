import { summarizeSeasonStats, type MatchStatRecord, type Season } from './playerStats'
import { seasonPresentation } from './seasonPresentation'
import { seasonYearForDate } from './seasonNavigation'
import { buildPersonalRecords } from './personalRecords'
import type { Competition } from './competitionFilters'

export type ReviewMetrics = {
  appearances: number | null
  goals: number | null
  assists: number | null
  contributions: number | null
  minutes: number | null
  motm: number | null
}

const unknownStatistics = (row: MatchStatRecord): MatchStatRecord => ({
  ...row, has_played: null, minutes_played: null, goals: null, assists: null,
  yellow_cards: null, red_cards: null, is_motm: null, position_played: null,
})

/** A read-only review of recorded matches, never a total of manual career entries. */
export function buildSeasonReview(
  input: readonly MatchStatRecord[],
  season: Season,
  activeComps: readonly Competition[],
  current: Season,
  playerId: string,
) {
  const unique = new Map<string, MatchStatRecord>()
  for (const row of input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.matches.match_date)
      || seasonYearForDate(row.matches.match_date) !== season.startYear
      || !activeComps.some(comp => comp === row.matches.competition_type)) continue
    const previous = unique.get(row.matches.id)
    if (!previous) unique.set(row.matches.id, row)
    // A conflicting duplicate cannot safely be interpreted as two matches or as
    // a confirmed performance. Ordinary SQL rows/left joins arrive once per id.
    else if (JSON.stringify(previous) !== JSON.stringify(row)) unique.set(row.matches.id, unknownStatistics(previous))
  }
  const rows = [...unique.values()].sort((a, b) => a.matches.match_date.localeCompare(b.matches.match_date) || a.matches.id.localeCompare(b.matches.id))
  const summary = summarizeSeasonStats(rows, season, activeComps)
  const presentation = seasonPresentation(summary, rows.length)
  const { known } = presentation
  const metrics: ReviewMetrics = {
    appearances: known.participation ? summary.matchesPlayed : null,
    goals: known.goals ? summary.totalGoals : null,
    assists: known.assists ? summary.totalAssists : null,
    contributions: known.ga ? summary.totalGA : null,
    minutes: known.minutes ? summary.totalMinutes : null,
    motm: known.motm ? summary.totalMotm : null,
  }
  const timeline = rows.map((row, index) => {
    const goals = row.has_played === true ? row.goals : null
    const assists = row.has_played === true ? row.assists : null
    return {
      id: row.matches.id,
      date: row.matches.match_date,
      opponent: row.matches.opponent,
      participation: row.has_played,
      goals,
      assists,
      contributions: goals !== null && assists !== null ? goals + assists : null,
      cumGoals: presentation.chartData[index].goals,
      cumAssists: presentation.chartData[index].assists,
    }
  })
  const records = buildPersonalRecords(rows.map(row => ({
    ...row.matches, player_id: playerId,
    statistics: { player_id: playerId, has_played: row.has_played, goals: row.goals, assists: row.assists, is_motm: row.is_motm },
  })), playerId, activeComps)
  const status: 'current' | 'finished' | 'future' = season.startYear === current.startYear ? 'current' : season.startYear < current.startYear ? 'finished' : 'future'
  return {
    season, status, rows, summary, presentation, metrics, timeline, records,
    milestones: rows.filter(row => row.has_played === true && row.is_motm === true),
  }
}

export type SeasonReview = ReturnType<typeof buildSeasonReview>

/** Differences describe recorded totals; they never imply an improvement. */
export function compareSeasonReviews(selected: SeasonReview, other: SeasonReview) {
  const compare = (a: number | null, b: number | null) => ({
    selected: a, other: b, difference: a !== null && b !== null ? a - b : null,
  })
  const ratio = (review: SeasonReview) => review.metrics.contributions !== null
    && review.metrics.appearances !== null && review.metrics.appearances > 0
    ? review.metrics.contributions / review.metrics.appearances : null
  return {
    appearances: compare(selected.metrics.appearances, other.metrics.appearances),
    goals: compare(selected.metrics.goals, other.metrics.goals),
    assists: compare(selected.metrics.assists, other.metrics.assists),
    contributions: compare(selected.metrics.contributions, other.metrics.contributions),
    minutes: compare(selected.metrics.minutes, other.metrics.minutes),
    motm: compare(selected.metrics.motm, other.metrics.motm),
    contributionsPerAppearance: compare(ratio(selected), ratio(other)),
  }
}
