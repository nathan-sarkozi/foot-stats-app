'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function addMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // 1. Extract and format match data
  const matchDate = formData.get('match_date') as string
  const opponent = formData.get('opponent') as string
  const competitionType = formData.get('competition_type') as string
  const teamScore = parseInt(formData.get('team_score') as string) || 0
  const opponentScore = parseInt(formData.get('opponent_score') as string) || 0

// 2. Insert Match
  const { data: matchData, error: matchError } = await supabase
    .from('matches')
    .insert({
      player_id: user.id, // AJOUT CRUCIAL POUR LE MULTI-COMPTES 👇
      match_date: matchDate,
      opponent,
      competition_type: competitionType,
      team_score: teamScore,
      opponent_score: opponentScore,
    })
    .select('id')
    .single()

  if (matchError || !matchData) {
    console.error('Match Insert Error:', matchError)
    throw new Error('Failed to create match')
  }

  // 3. Extract and format statistics data
  // Checkbox returns 'on' if checked, null if unchecked
  const hasPlayed = formData.get('has_played') === 'on' 

  const rawYellow = parseInt(formData.get('yellow_cards') as string) || 0
  const rawRed = parseInt(formData.get('red_cards') as string) || 0

  const yellowCards = Math.min(rawYellow, 2)
  // Business rule: 2 yellow cards automatically results in 1 red card
  const redCards = yellowCards === 2 ? 1 : Math.min(rawRed, 1)
  
  const statsPayload = {
    player_id: user.id,
    match_id: matchData.id,
    has_played: hasPlayed,
    minutes_played: hasPlayed ? (parseInt(formData.get('minutes_played') as string) || 0) : 0,
    goals: hasPlayed ? (parseInt(formData.get('goals') as string) || 0) : 0,
    assists: hasPlayed ? (parseInt(formData.get('assists') as string) || 0) : 0,
    yellow_cards: hasPlayed ? yellowCards : 0,
    red_cards: hasPlayed ? redCards : 0,
  }

  // 4. Insert Statistics
  const { error: statsError } = await supabase
    .from('statistics')
    .insert(statsPayload)

  if (statsError) {
    console.error('Stats Insert Error:', statsError)
    // Note d'architecture : Idéalement, en cas d'erreur ici, il faudrait annuler l'insertion du match (Rollback).
    // Pour simplifier cette v1, on logue l'erreur.
    throw new Error('Failed to save statistics')
  }

  // 5. Cache invalidation & Redirect
  // Crucial: Tells Next.js to purge the cached dashboard page so the new match appears immediately
  revalidatePath('/dashboard')
  redirect('/dashboard')
}