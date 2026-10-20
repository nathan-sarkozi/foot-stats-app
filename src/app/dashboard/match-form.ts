import { z } from 'zod'
import type { Database } from '../../types/supabase'

export const matchIdSchema = z.uuid().transform((id) => id.toLowerCase())

// An empty field is unknown, not a recorded zero. The existing RPC requires
// known numeric values, so ask for them explicitly instead of inventing data.
const numericField = (maximum: number) => z.preprocess(
  value => value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value,
  z.coerce.number().int().min(0).max(maximum),
)

const matchFormSchema = z.object({
  match_date: z.iso.date(),
  opponent: z.string().min(2, 'Opponent name too short').max(100, 'Opponent name too long'),
  competition_type: z.enum(['LEAGUE', 'CUP', 'FRIENDLY']),
  team_score: numericField(99),
  opponent_score: numericField(99),
  has_played: z.boolean(),
  is_motm: z.boolean(),
  position_played: z.enum(['BU', 'AG', 'AD', 'MOC', 'MC', 'MDC', 'DG', 'DD', 'DC', 'GB']).nullable(),
  minutes_played: numericField(120),
  goals: numericField(50),
  assists: numericField(50),
  yellow_cards: numericField(2),
  red_cards: numericField(1),
}).transform(data => ({
  ...data,
  // Red cards count expulsions, including one resulting from two yellows.
  // Validate both inputs first: do not hide an invalid red count with this rule.
  red_cards: data.yellow_cards === 2 ? 1 : data.red_cards,
}))

type MatchFormData = z.infer<typeof matchFormSchema>
type SaveMatchArgs = Database['public']['Functions']['save_match_with_statistics']['Args']

export function parseMatchFormData(formData: FormData) {
  const hasPlayedRaw = formData.get('has_played')
  const isMotmRaw = formData.get('is_motm')
  const position = formData.get('position_played')
  const hasPlayed = hasPlayedRaw === 'true' || hasPlayedRaw === 'on'
  const playingValue = (name: string) => {
    const value = formData.get(name)
    // Explicitly blank legacy fields must be completed even for a substitute.
    if (typeof value === 'string' && value.trim() === '') return undefined
    return hasPlayed ? value : 0
  }

  return matchFormSchema.safeParse({
    match_date: formData.get('match_date'),
    opponent: formData.get('opponent'),
    competition_type: formData.get('competition_type'),
    team_score: formData.get('team_score'),
    opponent_score: formData.get('opponent_score'),
    has_played: hasPlayedRaw === '' ? undefined : hasPlayed,
    is_motm: isMotmRaw === '' ? undefined : hasPlayed && (isMotmRaw === 'true' || isMotmRaw === 'on'),
    position_played: hasPlayed && typeof position === 'string' ? position.trim() || null : null,
    minutes_played: playingValue('minutes_played'),
    goals: playingValue('goals'),
    assists: playingValue('assists'),
    // A substitute can receive a card without entering the pitch.
    yellow_cards: formData.get('yellow_cards'),
    red_cards: formData.get('red_cards'),
  })
}

export function toMatchRpcArgs(data: MatchFormData, matchId?: string): SaveMatchArgs {
  return {
    p_match_date: data.match_date,
    p_opponent: data.opponent,
    p_competition_type: data.competition_type,
    p_team_score: data.team_score,
    p_opponent_score: data.opponent_score,
    p_has_played: data.has_played,
    p_is_motm: data.is_motm,
    p_position_played: data.position_played,
    p_minutes_played: data.minutes_played,
    p_goals: data.goals,
    p_assists: data.assists,
    p_yellow_cards: data.yellow_cards,
    p_red_cards: data.red_cards,
    ...(matchId === undefined ? {} : { p_match_id: matchId }),
  }
}
