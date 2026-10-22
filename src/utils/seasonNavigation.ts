import type { Season, MatchStatRecord } from './playerStats'
import { COMPETITIONS, parseCompetitionParams, type Competition } from './competitionFilters'
import type { Tables } from '@/types/supabase'

export type SeasonMatch = MatchStatRecord['matches']
export type SeasonCareer = Pick<Tables<'career_entries'>,
  | 'id' | 'season_start' | 'season_end' | 'club' | 'category' | 'is_youth'
  | 'is_free_agent' | 'has_stats' | 'matches_played' | 'goals' | 'assists' | 'yellow_cards' | 'red_cards'
>

export function seasonFromYear(startYear: number): Season {
  return { startYear, endYear: startYear + 1, startDate: `${String(startYear).padStart(4, '0')}-07-01`, endDate: `${String(startYear + 1).padStart(4, '0')}-07-01` }
}

export const seasonKey = (season: Season) => `${season.startYear}-${season.endYear}`

export function includeUnreportedMatches(matches: readonly SeasonMatch[], statistics: readonly MatchStatRecord[]): MatchStatRecord[] {
  const recorded = new Map(statistics.map(stat => [stat.matches.id, stat]))
  return matches.map(match => recorded.get(match.id) ?? {
    matches: match, has_played: null, minutes_played: null, goals: null, assists: null,
    yellow_cards: null, red_cards: null, is_motm: null, position_played: null,
  })
}

// matches.match_date is a PostgreSQL DATE: never interpret it in the server's timezone.
// Explicit-offset timestamps, if supplied, are assigned by their Belgian calendar date.
// An offset-less datetime is deliberately not guessed.
export function seasonYearForDate(value: string): number | null {
  let calendarDate = value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
    const instant = new Date(value)
    if (!Number.isFinite(instant.getTime())) return null
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
    calendarDate = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
  }
  const [year, month, day] = calendarDate.split('-').map(Number)
  const date = new Date(`${calendarDate}T12:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== calendarDate || !day) return null
  const startYear = month >= 7 ? year : year - 1
  return startYear >= 1 && startYear < 9999 ? startYear : null
}

export function selectSeason(matches: readonly SeasonMatch[], career: readonly SeasonCareer[], current: Season, value: unknown, competitions: unknown, additionalYears: readonly number[] = []) {
  const years = new Set([current.startYear])
  // Only private callers supply additional years, e.g. seasons with personal goals.
  // Public catalogues retain exactly their match/career sources by default.
  for (const year of additionalYears) if (Number.isInteger(year) && year >= 1 && year < 9999) years.add(year)
  for (const match of matches) {
    const year = seasonYearForDate(match.match_date)
    if (year !== null) years.add(year)
  }
  for (const entry of career) {
    if (Number.isInteger(entry.season_start) && entry.season_start >= 1 && entry.season_start < 9999 && entry.season_end === entry.season_start + 1) years.add(entry.season_start)
  }
  const seasons = [...years].sort((a, b) => b - a).map(seasonFromYear)
  const season = seasons.find(season => seasonKey(season) === value) ?? current
  const seasonMatches = matches.filter(match => seasonYearForDate(match.match_date) === season.startYear)
  const availableComps = COMPETITIONS.filter(comp => seasonMatches.some(match => match.competition_type === comp))
  const requested = parseCompetitionParams(competitions)
  const valid = requested.filter(comp => availableComps.includes(comp))
  const activeComps: Competition[] = valid.length ? valid : [...availableComps]
  return {
    seasons, season, seasonMatches, availableComps, activeComps,
    careerEntries: career.filter(entry => entry.season_start === season.startYear && entry.season_end === season.endYear),
    isCurrent: season.startYear === current.startYear,
    invalidSeason: value !== undefined && value !== seasonKey(season),
    resetCompetitions: competitions !== undefined && availableComps.length > 0 && valid.length === 0,
  }
}
