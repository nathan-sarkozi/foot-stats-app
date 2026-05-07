'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function updateMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // 1. Extract IDs from hidden fields
  const matchId = formData.get('match_id') as string
  const statId = formData.get('stat_id') as string

  if (!matchId || !statId) throw new Error('Missing Identifiers')

  // 2. Extract and format match data
  const matchPayload = {
    match_date: formData.get('match_date') as string,
    opponent: formData.get('opponent') as string,
    competition_type: formData.get('competition_type') as string,
    team_score: parseInt(formData.get('team_score') as string) || 0,
    opponent_score: parseInt(formData.get('opponent_score') as string) || 0,
  }

  // 3. Update Match Table
  const { error: matchError } = await supabase
    .from('matches')
    .update(matchPayload)
    .eq('id', matchId)

  if (matchError) {
    console.error('Match Update Error:', matchError)
    throw new Error('Failed to update match')
  }

  // 4. Extract and format statistics data
  const hasPlayed = formData.get('has_played') === 'on' 

  const rawYellow = parseInt(formData.get('yellow_cards') as string) || 0
  const rawRed = parseInt(formData.get('red_cards') as string) || 0

  const yellowCards = Math.min(rawYellow, 2)
  // Business rule: 2 yellow cards automatically results in 1 red card
  const redCards = yellowCards === 2 ? 1 : Math.min(rawRed, 1)
  
  const statsPayload = {
    has_played: hasPlayed,
    minutes_played: hasPlayed ? (parseInt(formData.get('minutes_played') as string) || 0) : 0,
    goals: hasPlayed ? (parseInt(formData.get('goals') as string) || 0) : 0,
    assists: hasPlayed ? (parseInt(formData.get('assists') as string) || 0) : 0,
    yellow_cards: hasPlayed ? yellowCards : 0,
    red_cards: hasPlayed ? redCards : 0,
  }

  // 5. Update Statistics Table
  const { error: statsError } = await supabase
    .from('statistics')
    .update(statsPayload)
    .eq('id', statId)
    // Extra security check: ensure the user updating owns the stat row
    .eq('player_id', user.id)

  if (statsError) {
    console.error('Stats Update Error:', statsError)
    throw new Error('Failed to update statistics')
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

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

  revalidatePath('/dashboard')
  redirect('/dashboard')
}