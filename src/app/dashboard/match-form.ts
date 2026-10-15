import { z } from 'zod'
import type { Database } from '../../types/supabase'

export const matchIdSchema = z.uuid().transform((id) => id.toLowerCase())

const matchFormSchema = z.object({
  match_date: z.iso.date(),
  opponent: z.string().min(2, 'Opponent name too short').max(100, 'Opponent name too long'),
  competition_type: z.enum(['LEAGUE', 'CUP', 'FRIENDLY']),
  team_score: z.coerce.number().int().min(0).max(99),
  opponent_score: z.coerce.number().int().min(0).max(99),
  has_played: z.boolean(),
  is_motm: z.boolean(),
  position_played: z.enum(['BU', 'AG', 'AD', 'MOC', 'MC', 'MDC', 'DG', 'DD', 'DC', 'GB']).nullable(),
  minutes_played: z.coerce.number().int().min(0).max(120),
  goals: z.coerce.number().int().min(0).max(50),
  assists: z.coerce.number().int().min(0).max(50),
  yellow_cards: z.coerce.number().int().min(0).max(2),
  red_cards: z.coerce.number().int().min(0).max(1),
})

type MatchFormData = z.infer<typeof matchFormSchema>
type SaveMatchArgs = Database['public']['Functions']['save_match_with_statistics']['Args']

export function parseMatchFormData(formData: FormData) {
  const hasPlayedRaw = formData.get('has_played')
  const isMotmRaw = formData.get('is_motm')
  const position = formData.get('position_played')
  const hasPlayed = hasPlayedRaw === 'true' || hasPlayedRaw === 'on'

  return matchFormSchema.safeParse({
    match_date: formData.get('match_date'),
    opponent: formData.get('opponent'),
    competition_type: formData.get('competition_type'),
    team_score: formData.get('team_score'),
    opponent_score: formData.get('opponent_score'),
    has_played: hasPlayed,
    is_motm: hasPlayed && (isMotmRaw === 'true' || isMotmRaw === 'on'),
    position_played: hasPlayed && typeof position === 'string' ? position.trim() || null : null,
    minutes_played: hasPlayed ? formData.get('minutes_played') : 0,
    goals: hasPlayed ? formData.get('goals') : 0,
    assists: hasPlayed ? formData.get('assists') : 0,
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
