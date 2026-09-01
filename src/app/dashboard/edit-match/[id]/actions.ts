'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

type Position = 'BU' | 'AG' | 'AD' | 'MOC' | 'MC' | 'MDC' | 'DG' | 'DD' | 'DC' | 'GB' | ''

export async function updateMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const matchId = formData.get('match_id') as string
  const statId = formData.get('stat_id') as string // Requis par ton code

  if (!matchId || !statId) throw new Error('Missing Identifiers')

  // 1. Algorithmic Match Result Calculation
  const teamScore = parseInt(formData.get('team_score') as string) || 0
  const opponentScore = parseInt(formData.get('opponent_score') as string) || 0
  
  let matchResult = 'N'
  if (teamScore > opponentScore) matchResult = 'V'
  if (teamScore < opponentScore) matchResult = 'D'

  const matchPayload = {
    match_date: formData.get('match_date') as string,
    opponent: formData.get('opponent') as string,
    competition_type: formData.get('competition_type') as string,
    team_score: teamScore,
    opponent_score: opponentScore,
    match_result: matchResult, 
  }

  // 2. Update Match
  const { error: matchError } = await supabase
    .from('matches')
    .update(matchPayload)
    .eq('id', matchId)

  if (matchError) {
    console.error('Match Update Error:', matchError)
    throw new Error('Failed to update match')
  }

  // 3. Extract Stats (Prise en compte des valeurs 'true' du nouveau frontend ou 'on' par défaut)
  const hasPlayed = formData.get('has_played') === 'true' || formData.get('has_played') === 'on'
  const isMotm = formData.get('is_motm') === 'true' || formData.get('is_motm') === 'on'
  const positionPlayed = formData.get('position_played') as Position

  const rawYellow = parseInt(formData.get('yellow_cards') as string) || 0
  const rawRed = parseInt(formData.get('red_cards') as string) || 0

  // Logique métier préservée
  const yellowCards = Math.min(rawYellow, 2)
  const redCards = yellowCards === 2 ? 1 : Math.min(rawRed, 1)
  
  const statsPayload = {
    has_played: hasPlayed,
    is_motm: hasPlayed ? isMotm : false,
    position_played: hasPlayed ? positionPlayed : null,
    minutes_played: hasPlayed ? (parseInt(formData.get('minutes_played') as string) || 0) : 0,
    goals: hasPlayed ? (parseInt(formData.get('goals') as string) || 0) : 0,
    assists: hasPlayed ? (parseInt(formData.get('assists') as string) || 0) : 0,
    yellow_cards: hasPlayed ? yellowCards : 0,
    red_cards: hasPlayed ? redCards : 0,
  }

  // 4. Update Stats
  const { error: statsError } = await supabase
    .from('statistics')
    .update(statsPayload)
    .eq('id', statId)
    .eq('player_id', user.id)

  if (statsError) {
    console.error('Stats Update Error:', statsError)
    throw new Error('Failed to update statistics')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// RESTAURATION DE LA FONCTION DELETE
export async function deleteMatch(formData: FormData) {
  const supabase = await createClient()
  const matchId = formData.get('match_id') as string

  if (!matchId) throw new Error('Missing ID')

  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId)

  if (error) {
    console.error('Delete Error:', error)
    throw new Error('Failed to delete match')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}