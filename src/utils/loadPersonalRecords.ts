import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { RecordMatch } from './personalRecords'

export const RECORDS_SELECT = 'id, player_id, match_date, opponent, competition_type, statistics!statistics_match_id_fkey(player_id, has_played, goals, assists, is_motm)'

export async function loadPersonalRecords(client: SupabaseClient<Database>, playerId: string): Promise<RecordMatch[]> {
  const matches: RecordMatch[] = []
  for (let offset = 0; ; offset += 1000) {
    // M2's composite FK and UNIQUE(player_id, match_id): zero or one statistics object.
    // Left embedding keeps unknown/missing statistics as a break in confirmed streaks.
    const { data, error } = await client.from('matches').select(RECORDS_SELECT)
      .eq('player_id', playerId).order('id').range(offset, offset + 999)
    if (error || !data) {
      console.error('Personal records read failed', { code: error?.code ?? 'NO_DATA' })
      throw new Error('Impossible de charger tes records. Réessaie dans quelques instants.')
    }
    matches.push(...data)
    if (data.length < 1000) return matches
  }
}
