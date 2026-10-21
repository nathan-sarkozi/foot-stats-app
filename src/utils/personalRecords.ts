import type { Tables } from '@/types/supabase'
import { seasonYearForDate } from './seasonNavigation'
import { COMPETITIONS, type Competition } from './competitionFilters'

export type RecordMatch = Pick<Tables<'matches'>, 'id' | 'player_id' | 'match_date' | 'opponent' | 'competition_type'> & {
  statistics: Pick<Tables<'statistics'>, 'player_id' | 'has_played' | 'goals' | 'assists' | 'is_motm'> | null
}
export type MatchRecord = { value: number | null; winners: RecordMatch[]; known: number; unknown: number }
export type RecordRun = { matches: RecordMatch[]; season: number }
export type StreakRecord = { value: number | null; winners: RecordRun[]; known: number; unknown: number; ambiguousDays: number }
export type SeasonRecord = { value: number | null; winners: number[]; known: number; unknown: number }

const numeric = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const played = (match: RecordMatch) => match.statistics?.has_played === true
const goals = (match: RecordMatch) => played(match) && numeric(match.statistics?.goals) ? match.statistics.goals : null
const assists = (match: RecordMatch) => played(match) && numeric(match.statistics?.assists) ? match.statistics.assists : null
const contributions = (match: RecordMatch) => {
  const g = goals(match), a = assists(match)
  return g !== null && a !== null ? g + a : null
}

function maximumOnMatch(matches: readonly RecordMatch[], read: (match: RecordMatch) => number | null): MatchRecord {
  let value: number | null = null, known = 0, unknown = 0
  let winners: RecordMatch[] = []
  for (const match of matches) {
    if (match.statistics?.has_played === false) continue
    const count = read(match)
    if (count === null) { unknown++; continue }
    known++
    if (value === null || count > value) { value = count; winners = [match] }
    else if (count === value) winners.push(match)
  }
  return { value, winners, known, unknown }
}

function longestRun(matches: readonly RecordMatch[], qualifies: (match: RecordMatch) => boolean | null): StreakRecord {
  const dates = new Map<string, number>()
  for (const match of matches) if (match.statistics?.has_played !== false) dates.set(match.match_date, (dates.get(match.match_date) ?? 0) + 1)
  const ambiguousDays = [...dates.values()].filter(count => count > 1).length
  let value: number | null = null, known = 0, unknown = 0, season: number | null = null
  let current: RecordMatch[] = [], winners: RecordRun[] = []
  const close = () => {
    if (current.length && season !== null) {
      if (value === null || current.length > value) { value = current.length; winners = [{ matches: current, season }] }
      else if (current.length === value) winners.push({ matches: current, season })
    }
    current = []
  }
  for (const match of matches) {
    const year = seasonYearForDate(match.match_date)!
    if (year !== season) { close(); season = year }
    if (match.statistics?.has_played === false) continue
    if ((dates.get(match.match_date) ?? 0) > 1) { close(); continue }
    const result = played(match) ? qualifies(match) : null
    if (result === null) { unknown++; close(); continue }
    known++
    if (value === null) value = 0
    if (result) current.push(match)
    else close()
  }
  close()
  return { value, winners, known, unknown, ambiguousDays }
}

function maximumSeason(groups: ReadonlyMap<number, RecordMatch[]>, read: (matches: RecordMatch[]) => number | null): SeasonRecord {
  let value: number | null = null, known = 0, unknown = 0
  let winners: number[] = []
  for (const [year, matches] of groups) {
    const total = read(matches)
    if (total === null) { unknown++; continue }
    known++
    if (value === null || total > value) { value = total; winners = [year] }
    else if (total === value) winners.push(year)
  }
  return { value, winners, known, unknown }
}

function seasonTotal(matches: readonly RecordMatch[], metric: 'goals' | 'assists' | 'motm' | 'appearances') {
  let total = 0
  for (const match of matches) {
    const stat = match.statistics
    if (stat?.has_played === false) continue
    if (stat?.has_played !== true) return null
    if (metric === 'appearances') total++
    else if (metric === 'motm') {
      if (typeof stat.is_motm !== 'boolean') return null
      if (stat.is_motm) total++
    } else {
      const count = stat[metric]
      if (!numeric(count)) return null
      total += count
    }
  }
  return total
}

/** Only recorded matches, never career_entries. No input mutation or persisted record. */
export function buildPersonalRecords(input: readonly RecordMatch[], playerId: string, competitions: readonly Competition[] = COMPETITIONS) {
  const unique = new Map<string, RecordMatch>()
  let invalidDates = 0
  for (const match of input) {
    if (match.player_id !== playerId || !competitions.some(comp => comp === match.competition_type)) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(match.match_date) || seasonYearForDate(match.match_date) === null) { invalidDates++; continue }
    // A foreign statistics row must never contribute, even if a test/input is malformed.
    const safe = match.statistics?.player_id === playerId ? match : { ...match, statistics: null }
    const previous = unique.get(match.id)
    if (!previous) unique.set(match.id, safe)
    else if (JSON.stringify(previous) !== JSON.stringify(safe)) unique.set(match.id, { ...previous, statistics: null })
  }
  const matches = [...unique.values()].sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id))
  const seasons = new Map<number, RecordMatch[]>()
  for (const match of matches) {
    const year = seasonYearForDate(match.match_date)!
    const rows = seasons.get(year) ?? []
    rows.push(match); seasons.set(year, rows)
  }
  return {
    matches,
    appearances: matches.filter(played).length,
    seasonCount: seasons.size,
    invalidDates,
    onMatch: { goals: maximumOnMatch(matches, goals), assists: maximumOnMatch(matches, assists), contributions: maximumOnMatch(matches, contributions) },
    streaks: {
      goals: longestRun(matches, match => { const count = goals(match); return count === null ? null : count > 0 }),
      contributions: longestRun(matches, match => {
        const g = goals(match), a = assists(match)
        if ((g !== null && g > 0) || (a !== null && a > 0)) return true
        return g !== null && a !== null ? false : null
      }),
    },
    seasons: {
      goals: maximumSeason(seasons, rows => seasonTotal(rows, 'goals')),
      assists: maximumSeason(seasons, rows => seasonTotal(rows, 'assists')),
      appearances: maximumSeason(seasons, rows => seasonTotal(rows, 'appearances')),
      motm: maximumSeason(seasons, rows => seasonTotal(rows, 'motm')),
    },
  }
}
