'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// Strict typing for allowed positions
type Position = 'BU' | 'AG' | 'AD' | 'MOC' | 'MC' | 'MDC' | 'DG' | 'DD' | 'DC' | 'GB' | ''

export async function addMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // 1. Extract match data
  const matchDate = formData.get('match_date') as string
  const opponent = formData.get('opponent') as string
  const competitionType = formData.get('competition_type') as string
  const teamScore = parseInt(formData.get('team_score') as string) || 0
  const opponentScore = parseInt(formData.get('opponent_score') as string) || 0

  // 2. Algorithmic Match Result Calculation
  let matchResult = 'N'
  if (teamScore > opponentScore) matchResult = 'V'
  if (teamScore < opponentScore) matchResult = 'D'

  // 3. Insert Match
  const { data: matchData, error: matchError } = await supabase
    .from('matches')
    .insert({
      player_id: user.id,
      match_date: matchDate,
      opponent,
      competition_type: competitionType,
      team_score: teamScore,
      opponent_score: opponentScore,
      match_result: matchResult, // Auto-calculated
    })
    .select('id')
    .single()

  if (matchError || !matchData) {
    console.error('Match Insert Error:', matchError)
    throw new Error('Failed to create match')
  }

  // 4. Extract statistics data
  const hasPlayed = formData.get('has_played') === 'on' 
  const isMotm = formData.get('is_motm') === 'on'
  const positionPlayed = formData.get('position_played') as Position

  const rawYellow = parseInt(formData.get('yellow_cards') as string) || 0
  const rawRed = parseInt(formData.get('red_cards') as string) || 0

  const yellowCards = Math.min(rawYellow, 2)
  const redCards = yellowCards === 2 ? 1 : Math.min(rawRed, 1)
  
  const statsPayload = {
    player_id: user.id,
    match_id: matchData.id,
    has_played: hasPlayed,
    is_motm: hasPlayed ? isMotm : false, // Cannot be MOTM if didn't play
    position_played: hasPlayed ? positionPlayed : null,
    minutes_played: hasPlayed ? (parseInt(formData.get('minutes_played') as string) || 0) : 0,
    goals: hasPlayed ? (parseInt(formData.get('goals') as string) || 0) : 0,
    assists: hasPlayed ? (parseInt(formData.get('assists') as string) || 0) : 0,
    yellow_cards: hasPlayed ? yellowCards : 0,
    red_cards: hasPlayed ? redCards : 0,
  }

  // 5. Insert Statistics
  const { error: statsError } = await supabase
    .from('statistics')
    .insert(statsPayload)

  if (statsError) {
    console.error('Stats Insert Error:', statsError)
    throw new Error('Failed to save statistics')
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}