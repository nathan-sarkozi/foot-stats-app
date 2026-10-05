'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

const CareerEntrySchema = z.object({
  season_start: z.coerce.number().min(1990).max(2030),
  is_free_agent: z.boolean(),
  club: z.string().trim().max(100).nullable(),
  category: z.string().trim().max(50).nullable(),
  is_youth: z.boolean(),
  has_stats: z.boolean(),
  matches_played: z.coerce.number().min(0).max(100).default(0),
  goals: z.coerce.number().min(0).max(200).default(0),
  assists: z.coerce.number().min(0).max(200).default(0),
  yellow_cards: z.coerce.number().min(0).max(50).default(0),
  red_cards: z.coerce.number().min(0).max(20).default(0),
})

export async function saveCareerEntry(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const entryId = formData.get('entry_id') as string | null
  const isFreeAgent = formData.has('is_free_agent')
  const hasStats = formData.has('has_stats')

  const rawData = {
    season_start: formData.get('season_start'),
    is_free_agent: isFreeAgent,
    club: isFreeAgent ? null : (formData.get('club') || null),
    category: isFreeAgent ? null : (formData.get('category') || null),
    is_youth: formData.has('is_youth'),
    has_stats: hasStats,
    matches_played: hasStats ? formData.get('matches_played') : 0,
    goals: hasStats ? formData.get('goals') : 0,
    assists: hasStats ? formData.get('assists') : 0,
    yellow_cards: hasStats ? formData.get('yellow_cards') : 0,
    red_cards: hasStats ? formData.get('red_cards') : 0,
  }

  const validatedFields = CareerEntrySchema.safeParse(rawData)
  if (!validatedFields.success) throw new Error('Données invalides')

  const dbData = {
    player_id: user.id,
    season_end: validatedFields.data.season_start + 1,
    ...validatedFields.data
  }

  if (entryId) {
    const { error } = await supabase.from('career_entries').update(dbData).match({ id: entryId, player_id: user.id })
    if (error) throw new Error('Erreur mise à jour')
  } else {
    const { error } = await supabase.from('career_entries').insert(dbData)
    if (error) throw new Error('Erreur insertion')
  }

  revalidatePath('/', 'layout')
  if (entryId) redirect('/dashboard/career')
}

export async function deleteCareerEntry(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const entryId = formData.get('entry_id') as string
  if (!entryId) throw new Error('ID manquant')

  const { error } = await supabase.from('career_entries').delete().match({ id: entryId, player_id: user.id })
  if (error) throw new Error('Erreur suppression')

  revalidatePath('/', 'layout')
}