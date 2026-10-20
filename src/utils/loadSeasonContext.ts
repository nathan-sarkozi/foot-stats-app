import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Lightweight metadata, scoped to the same player as the selected statistics.
// Pagination avoids silently losing older seasons at the API's 1,000-row limit.
export async function loadSeasonContext(client: SupabaseClient<Database>, playerId: string) {
  const matches = []
  const career = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('matches').select('id, match_date, competition_type, opponent, team_score, opponent_score')
      .eq('player_id', playerId).order('id').range(offset, offset + pageSize - 1)
    if (error) throw new Error('Impossible de charger les saisons des matchs.', { cause: error })
    matches.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('career_entries')
      .select('id, season_start, season_end, club, category, is_youth, is_free_agent, has_stats, matches_played, goals, assists, yellow_cards, red_cards')
      .eq('player_id', playerId).order('id').range(offset, offset + pageSize - 1)
    if (error) throw new Error('Impossible de charger les saisons de carrière.', { cause: error })
    career.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return { matches, career }
}
