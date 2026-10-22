// Compile-only fixture: never import or execute this module at runtime.
// The runner uses TypeScript's noEmit compiler; no SDK request is executed.
import type { QueryData, SupabaseClient } from '@supabase/supabase-js'
import type { createClient as browserFactory } from '../src/utils/supabase/client'
import type { createClient as serverFactory } from '../src/utils/supabase/server'
import type { updateSession } from '../src/utils/supabase/proxy'
import type { GET as rbfaCron } from '../src/app/api/cron/rbfa/route'
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from '../src/types/supabase'
import type { MatchStatRecord } from '../src/utils/playerStats'
import type { CareerEntry } from '../src/app/dashboard/career/career-form'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false
type Assert<Value extends true> = Value
type Simplify<Value> = { [Key in keyof Value]: Value[Key] }

declare const browser: ReturnType<typeof browserFactory>
declare const server: Awaited<ReturnType<typeof serverFactory>>
declare const service: SupabaseClient<Database>
const id = '10000000-0000-4000-8000-000000000001'

const profile = browser.from('profiles').select('id, avatar_url, rbfa_team_id, jersey_number')
const career = server.from('career_entries').select('id, player_id, season_start, has_stats, goals')
const players = server.from('players').select('id, username')
const cache = service.from('rbfa_cache').select('team_id, upcoming_match, rankings, updated_at')
const aggregates = browser.from('player_season_aggregates').select('*')
const match = server.from('matches').select('id, team_score, opponent_score').maybeSingle()
const forward = server.from('statistics').select('id, matches!inner(id, team_score, opponent_score)')
const reverse = browser.from('matches').select('id, statistics(id, goals)')
const seasonGoals = server.from('season_goals').select('id, player_id, season_start, metric, target, created_at')
const profileGoals = server.from('profiles').select('id, season_goals(id, season_start, metric, target)')
const statistics = browser.from('statistics').select(`
  has_played, minutes_played, goals, assists, yellow_cards, red_cards, is_motm, position_played,
  matches!inner(id, match_date, opponent, team_score, opponent_score, competition_type)
`)

const newMatch: TablesInsert<'matches'> = {
  match_date: '2026-10-19', opponent: 'Synthetic opponent', competition_type: 'LEAGUE',
}
const newStatistic: TablesInsert<'statistics'> = { player_id: id, match_id: id, goals: 1 }
const newCareer: TablesInsert<'career_entries'> = { player_id: id, season_start: 2025, season_end: 2026 }
const updatedProfile: TablesUpdate<'profiles'> = { avatar_url: null, rbfa_team_id: '123', jersey_number: 9 }
// Ownership, UUID and timestamp are supplied by database defaults. PostgreSQL
// grants additionally restrict which columns authenticated clients may write.
const newSeasonGoal: TablesInsert<'season_goals'> = { season_start: 2026, metric: 'goals', target: 15 }
const updatedGoalTarget: Pick<TablesUpdate<'season_goals'>, 'target'> = { target: 20 }
browser.from('matches').insert(newMatch)
server.from('statistics').insert(newStatistic)
server.from('career_entries').insert(newCareer)
browser.from('profiles').update(updatedProfile).eq('id', id)
server.from('career_entries').delete().eq('id', id).eq('player_id', id)
service.from('rbfa_cache').upsert({ team_id: '123', upcoming_match: null, rankings: { teams: [] } })
server.from('season_goals').insert(newSeasonGoal)
server.from('season_goals').update(updatedGoalTarget).eq('id', id).eq('player_id', id)
server.from('season_goals').delete().eq('id', id).eq('player_id', id)

const rpcArgs: Database['public']['Functions']['save_match_with_statistics']['Args'] = {
  p_match_date: '2026-10-19', p_opponent: 'Synthetic opponent', p_competition_type: 'LEAGUE',
  p_team_score: 1, p_opponent_score: 0, p_has_played: false, p_is_motm: false,
  p_minutes_played: 0, p_goals: 0, p_assists: 0, p_yellow_cards: 1, p_red_cards: 0,
}
const rpc = server.rpc('save_match_with_statistics', rpcArgs)
browser.rpc('save_match_with_statistics', { ...rpcArgs, p_match_id: null, p_position_played: null })
browser.rpc('save_match_with_statistics', { ...rpcArgs, p_match_id: id, p_position_played: 'MC' })

// @ts-expect-error An untyped client would incorrectly permit an unknown table.
browser.from('not_a_footstats_table')
// @ts-expect-error Statistics require the match reference as well as the owner.
server.from('statistics').insert({ player_id: id })
// @ts-expect-error Scores are numeric, including in updates.
browser.from('matches').update({ team_score: '2' })
// @ts-expect-error Profile numbers must not silently accept strings.
server.from('profiles').update({ jersey_number: '9' })
// @ts-expect-error Career season years are numeric.
server.from('career_entries').insert({ player_id: id, season_start: '2025', season_end: 2026 })
// @ts-expect-error Cache team IDs are text in PostgreSQL.
service.from('rbfa_cache').upsert({ team_id: 123 })
// @ts-expect-error A goal always requires a target, metric and season.
server.from('season_goals').insert({ season_start: 2026, metric: 'goals' })
// @ts-expect-error Targets are integers in SQL and numeric in TypeScript.
server.from('season_goals').update({ target: '20' })
// @ts-expect-error A goal target is never nullable.
server.from('season_goals').update({ target: null })
// @ts-expect-error Only declared PostgreSQL functions are callable.
browser.rpc('unknown_footstats_rpc', {})
// @ts-expect-error The transaction RPC requires its sporting and match fields.
server.rpc('save_match_with_statistics', {})
// @ts-expect-error The transaction RPC cannot accept string goal counts.
server.rpc('save_match_with_statistics', { ...rpcArgs, p_goals: '1' })
// @ts-expect-error The transaction derives ownership from auth.uid(), not an argument.
const ownerSuppliedArgs: typeof rpcArgs = { ...rpcArgs, p_player_id: id }
server.rpc('save_match_with_statistics', ownerSuppliedArgs)

const invalidColumn = browser.from('profiles').select('not_a_profile_column')
declare const invalidRows: QueryData<typeof invalidColumn>
// @ts-expect-error Invalid select columns produce SelectQueryError, not usable rows.
void invalidRows[0].id

// Value references keep lint meaningful in this compile-only fixture.
void [profile, career, players, cache, aggregates, match, forward, reverse, seasonGoals, profileGoals, statistics, rpc, invalidColumn]

export type SupabaseTypeAssertions = [
  Assert<Equal<keyof Database['public']['Tables'],
    'career_entries' | 'matches' | 'players' | 'profiles' | 'rbfa_cache' | 'season_goals' | 'statistics'>>,
  Assert<Equal<QueryData<typeof profile>[number],
    Pick<Tables<'profiles'>, 'id' | 'avatar_url' | 'rbfa_team_id' | 'jersey_number'>>>,
  Assert<Equal<QueryData<typeof career>[number],
    Pick<Tables<'career_entries'>, 'id' | 'player_id' | 'season_start' | 'has_stats' | 'goals'>>>,
  Assert<Equal<QueryData<typeof players>[number], Pick<Tables<'players'>, 'id' | 'username'>>>,
  Assert<Equal<QueryData<typeof cache>[number], Tables<'rbfa_cache'>>>,
  Assert<Equal<QueryData<typeof aggregates>[number], Tables<'player_season_aggregates'>>>,
  Assert<Equal<QueryData<typeof seasonGoals>[number], Tables<'season_goals'>>>,
  Assert<Equal<QueryData<typeof profileGoals>[number]['season_goals'],
    Pick<Tables<'season_goals'>, 'id' | 'season_start' | 'metric' | 'target'>[]>>,
  Assert<Equal<TablesInsert<'season_goals'>['player_id'], string | undefined>>,
  Assert<Equal<TablesUpdate<'season_goals'>['target'], number | undefined>>,
  Assert<Equal<Awaited<typeof match>['data'],
    Pick<Tables<'matches'>, 'id' | 'team_score' | 'opponent_score'> | null>>,
  Assert<Equal<QueryData<typeof forward>[number]['matches'],
    { id: string; team_score: number | null; opponent_score: number | null }>>,
  Assert<Equal<QueryData<typeof reverse>[number]['statistics'], { id: string; goals: number | null } | null>>,
  Assert<Equal<QueryData<typeof statistics>[number], Simplify<MatchStatRecord>>>,
  Assert<Equal<QueryData<typeof rpc>, string>>,
  Assert<Equal<Tables<'profiles'>['avatar_url'], string | null>>,
  Assert<Equal<Tables<'profiles'>['rbfa_team_id'], string | null>>,
  Assert<Equal<CareerEntry['has_stats'], boolean | null>>,
  Assert<Equal<CareerEntry['goals'], number | null>>,
  Assert<Equal<Tables<'rbfa_cache'>['upcoming_match'], Json>>,
  Assert<Equal<Database['public']['Tables']['statistics']['Relationships'][0]['columns'], ['match_id', 'player_id']>>,
  Assert<Equal<Database['public']['Tables']['statistics']['Relationships'][0]['referencedColumns'], ['id', 'player_id']>>,
  Assert<Equal<Database['public']['Tables']['statistics']['Relationships'][0]['isOneToOne'], true>>,
  Assert<Awaited<ReturnType<typeof updateSession>> extends Response ? true : false>,
  Assert<Awaited<ReturnType<typeof rbfaCron>> extends Response ? true : false>,
]
