'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

const MatchSchema = z.object({
  match_date: z.string().min(1, 'Date required'),
  opponent: z.string().min(2, 'Opponent name too short').max(100, 'Opponent name too long'),
  competition_type: z.enum(['LEAGUE', 'CUP', 'FRIENDLY']),
  team_score: z.coerce.number().min(0).max(99),
  opponent_score: z.coerce.number().min(0).max(99),
  has_played: z.boolean(),
  is_motm: z.boolean(),
  position_played: z.enum(['BU', 'AG', 'AD', 'MOC', 'MC', 'MDC', 'DG', 'DD', 'DC', 'GB']).nullable().optional(),
  minutes_played: z.coerce.number().min(0).max(120),
  goals: z.coerce.number().min(0).max(50),
  assists: z.coerce.number().min(0).max(50),
  yellow_cards: z.coerce.number().min(0).max(2),
  red_cards: z.coerce.number().min(0).max(1),
})

export async function addMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const parseNullableString = (val: FormDataEntryValue | null) => {
    if (typeof val === 'string' && val.trim() !== '') return val.trim()
    return null
  }

  const hasPlayedRaw = formData.get('has_played')
  const isMotmRaw = formData.get('is_motm')
  const hasPlayed = hasPlayedRaw === 'true' || hasPlayedRaw === 'on'

  const rawData = {
    match_date: formData.get('match_date'),
    opponent: formData.get('opponent'),
    competition_type: formData.get('competition_type'),
    team_score: formData.get('team_score'),
    opponent_score: formData.get('opponent_score'),
    has_played: hasPlayed,
    is_motm: hasPlayed ? (isMotmRaw === 'true' || isMotmRaw === 'on') : false,
    position_played: hasPlayed ? parseNullableString(formData.get('position_played')) : null,
    minutes_played: hasPlayed ? formData.get('minutes_played') : 0,
    goals: hasPlayed ? formData.get('goals') : 0,
    assists: hasPlayed ? formData.get('assists') : 0,
    yellow_cards: hasPlayed ? formData.get('yellow_cards') : 0,
    red_cards: hasPlayed ? formData.get('red_cards') : 0,
  }

  const validatedFields = MatchSchema.safeParse(rawData)

  if (!validatedFields.success) {
    console.error('Validation Error:', validatedFields.error.flatten().fieldErrors)
    throw new Error('Invalid form data provided')
  }

  const cleanData = validatedFields.data

  let matchResult = 'N'
  if (cleanData.team_score > cleanData.opponent_score) matchResult = 'V'
  if (cleanData.team_score < cleanData.opponent_score) matchResult = 'D'

  // STEP 1: Insert Match
  const { data: matchData, error: matchError } = await supabase
    .from('matches')
    .insert({
      player_id: user.id,
      match_date: cleanData.match_date,
      opponent: cleanData.opponent,
      competition_type: cleanData.competition_type,
      team_score: cleanData.team_score,
      opponent_score: cleanData.opponent_score,
      match_result: matchResult,
    })
    .select('id')
    .single()

  if (matchError || !matchData) {
    throw new Error('Failed to create match details')
  }

  // STEP 2: Insert Statistics
  const statsPayload = {
    player_id: user.id,
    match_id: matchData.id,
    has_played: cleanData.has_played,
    is_motm: cleanData.is_motm,
    position_played: cleanData.position_played,
    minutes_played: cleanData.minutes_played,
    goals: cleanData.goals,
    assists: cleanData.assists,
    yellow_cards: cleanData.yellow_cards,
    red_cards: cleanData.red_cards,
  }

  const { error: statsError } = await supabase
    .from('statistics')
    .insert(statsPayload)

  // COMPENSATING ACTION: Rollback if stats fail to prevent orphaned rows
  if (statsError) {
    console.error('Stats Insert Error. Rolling back match creation...', statsError)
    await supabase.from('matches').delete().eq('id', matchData.id)
    throw new Error('Transaction failed. Database changes rolled back.')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}