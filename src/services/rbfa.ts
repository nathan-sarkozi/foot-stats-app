import { createClient } from '@/utils/supabase/server'
import { UpcomingMatchSchema, RankingsSchema, type UpcomingMatch, type Rankings } from '@/utils/rbfa-contracts'
import { parseRbfaStartTime } from '@/utils/rbfaDate'

export type UpcomingMatchState =
  | { status: 'scheduled' | 'unresolved'; match: UpcomingMatch }
  | { status: 'none' | 'stale' | 'unavailable'; match: null }

export interface TeamRbfaData {
  upcoming: UpcomingMatchState
  rankings: Rankings | null
}

function unavailable(): TeamRbfaData {
  return { upcoming: { status: 'unavailable', match: null }, rankings: null }
}

// Read both cache fields together so an unavailable response is not presented as
// a confirmed absence of fixtures. Reading expired data never changes the cache.
export async function getTeamRbfaData(teamId: string, now = Date.now()): Promise<TeamRbfaData> {
  if (!teamId) return unavailable()

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('rbfa_cache')
      .select('upcoming_match, rankings')
      .eq('team_id', teamId)
      .abortSignal(AbortSignal.timeout(5_000))
      .maybeSingle()

    if (error) {
      const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(error.code)
        ? error.code : 'CACHE_READ_ERROR'
      console.error('RBFA cache read failed', { code })
      return unavailable()
    }
    if (!data) return unavailable()

    const parsedRankings = RankingsSchema.safeParse(data.rankings)
    const rankings = parsedRankings.success ? parsedRankings.data : null
    if (data.upcoming_match === null) return { upcoming: { status: 'none', match: null }, rankings }

    const parsedMatch = UpcomingMatchSchema.safeParse(data.upcoming_match)
    if (!parsedMatch.success) return { upcoming: { status: 'unavailable', match: null }, rankings }

    const match = parsedMatch.data
    const timestamp = parseRbfaStartTime(match.startTime)
    if (match.startTime !== null && timestamp === null) {
      return { upcoming: { status: 'unresolved', match }, rankings }
    }
    if (timestamp !== null && timestamp <= now) return { upcoming: { status: 'stale', match: null }, rankings }

    return { upcoming: { status: 'scheduled', match }, rankings }
  } catch {
    console.error('RBFA cache read failed', { code: 'CACHE_READ_ERROR' })
    return unavailable()
  }
}

// Keep the existing service helpers available to other callers.
export async function getUpcomingMatch(teamId: string) {
  return (await getTeamRbfaData(teamId)).upcoming.match
}

export async function getTeamRankings(teamId: string) {
  return (await getTeamRbfaData(teamId)).rankings
}
