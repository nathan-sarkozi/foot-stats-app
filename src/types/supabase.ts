/**
 * Regeneration (local only, no production credentials or data):
 * 1. Load the trusted schema-only supabase-schema.sql into an empty isolated
 *    Supabase-compatible PostgreSQL 17 (auth, extensions and standard roles).
 *    The snapshot used here already includes M1, M2 and SEC-003; do not replay
 *    them. Apply only later migrations not already represented in the snapshot.
 *    Historical migrations alone omit career_entries, rbfa_cache and two profile
 *    columns. The ignored snapshot must therefore be available separately.
 * 2. From a temporary directory without .env, with LOCAL_DATABASE_URL pointing
 *    exclusively to that local database, run:
 *    npx supabase@2.120.0 gen types typescript --db-url "$LOCAL_DATABASE_URL" --schema public > generated.ts
 *    After success, review and copy the result to supabase.generated.ts (formatting
 *    only). Keep the two SQL-specific corrections below outside generated code.
 * 3. Check TypeScript and tests/supabase-types.test.mjs before accepting new types.
 *    This source is local introspection, not a check of current production drift.
 */
import type { Database as GeneratedDatabase } from './supabase.generated'

export type { Json, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from './supabase.generated'
export { Constants } from './supabase.generated'

type PublicSchema = GeneratedDatabase['public']
type Statistics = PublicSchema['Tables']['statistics']
type SaveMatch = PublicSchema['Functions']['save_match_with_statistics']

// CLI 2.120 compares FK column order with physical UNIQUE column order. M2's
// UNIQUE(player_id, match_id) guarantees one-to-one even though its FK uses
// (match_id, player_id). Correct only this generated false negative.
type StatisticsRelationships<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends { foreignKeyName: 'statistics_match_id_fkey' }
    ? Omit<T[K], 'isOneToOne'> & { isOneToOne: true }
    : T[K]
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: Omit<PublicSchema, 'Tables' | 'Functions'> & {
    Tables: Omit<PublicSchema['Tables'], 'statistics'> & {
      statistics: Omit<Statistics, 'Relationships'> & {
        Relationships: StatisticsRelationships<Statistics['Relationships']>
      }
    }
    Functions: Omit<PublicSchema['Functions'], 'save_match_with_statistics'> & {
      save_match_with_statistics: Omit<SaveMatch, 'Args'> & {
        // PostgreSQL does not expose parameter nullability to the generator.
        // M1 explicitly accepts NULL for these two DEFAULT NULL arguments.
        Args: Omit<SaveMatch['Args'], 'p_position_played' | 'p_match_id'> & {
          p_position_played?: SaveMatch['Args']['p_position_played'] | null
          p_match_id?: SaveMatch['Args']['p_match_id'] | null
        }
      }
    }
  }
}
