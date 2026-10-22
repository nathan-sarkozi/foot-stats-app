import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { SeasonGoal } from './seasonGoals'

export const SEASON_GOALS_SELECT = 'id, player_id, season_start, metric, target, created_at'

/** Read every private goal season, including seasons with no remaining match. */
export async function loadSeasonGoals(client: SupabaseClient<Database>, playerId: string): Promise<SeasonGoal[]> {
  const goals: SeasonGoal[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('season_goals').select(SEASON_GOALS_SELECT)
      .eq('player_id', playerId).order('id').range(offset, offset + 999)
    if (error || !data) {
      console.error('Season goals read failed', { code: error?.code ?? 'NO_DATA' })
      throw new Error('Impossible de charger tes objectifs. Réessaie dans quelques instants.')
    }
    goals.push(...data)
    if (data.length < 1000) return goals
  }
}
