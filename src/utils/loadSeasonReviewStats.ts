import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { MatchStatRecord, Season } from './playerStats'

export const SEASON_REVIEW_SELECT = 'has_played, minutes_played, goals, assists, yellow_cards, red_cards, is_motm, position_played, matches!inner(id, match_date, opponent, team_score, opponent_score, competition_type)'

export async function loadSeasonReviewStats(client: SupabaseClient<Database>, playerId: string, season: Season): Promise<MatchStatRecord[]> {
  const statistics: MatchStatRecord[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('statistics').select(SEASON_REVIEW_SELECT)
      .eq('player_id', playerId)
      .gte('matches.match_date', season.startDate)
      .lt('matches.match_date', season.endDate)
      .order('id').range(offset, offset + 999)
    if (error || !data) {
      console.error('Season review statistics read failed', { code: error?.code ?? 'NO_DATA' })
      throw new Error('Impossible de charger le bilan de ta saison. Réessaie dans quelques instants.')
    }
    statistics.push(...data)
    if (data.length < 1000) return statistics
  }
}
