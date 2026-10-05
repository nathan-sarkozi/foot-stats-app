'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

const CareerEntrySchema = z.object({
  season_start: z.coerce.number().min(1990).max(2030),
  season_end: z.coerce.number().min(1991).max(2031),
  is_free_agent: z.boolean(),
  club: z.string().trim().max(100).nullable(),
  category: z.string().trim().max(50).nullable(),
  is_youth: z.boolean(),
  matches_played: z.coerce.number().min(0).max(100).default(0),
  goals: z.coerce.number().min(0).max(200).default(0),
  assists: z.coerce.number().min(0).max(200).default(0),
  yellow_cards: z.coerce.number().min(0).max(50).default(0),
  red_cards: z.coerce.number().min(0).max(20).default(0),
}).refine(data => data.season_end === data.season_start + 1, {
  message: "La saison de fin doit suivre directement la saison de début (ex: 2023-2024)",
  path: ["season_end"]
})

export async function addCareerEntry(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const isFreeAgent = formData.get('is_free_agent') === 'true'

  const rawData = {
    season_start: formData.get('season_start'),
    season_end: formData.get('season_end'),
    is_free_agent: isFreeAgent,
    club: isFreeAgent ? null : (formData.get('club') || null),
    category: isFreeAgent ? null : (formData.get('category') || null),
    is_youth: formData.get('is_youth') === 'true',
    matches_played: formData.get('matches_played') || 0,
    goals: formData.get('goals') || 0,
    assists: formData.get('assists') || 0,
    yellow_cards: formData.get('yellow_cards') || 0,
    red_cards: formData.get('red_cards') || 0,
  }

  const validatedFields = CareerEntrySchema.safeParse(rawData)

  if (!validatedFields.success) {
    console.error('Career Validation Error:', validatedFields.error.flatten().fieldErrors)
    throw new Error('Données invalides')
  }

  const { error } = await supabase
    .from('career_entries')
    .insert({
      player_id: user.id,
      ...validatedFields.data
    })

  if (error) {
    console.error('Career Insert Error:', error)
    throw new Error('Erreur lors de l\'enregistrement')
  }

  revalidatePath('/', 'layout')
}

export async function deleteCareerEntry(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const entryId = formData.get('entry_id') as string
  if (!entryId) throw new Error('ID manquant')

  const { error } = await supabase
    .from('career_entries')
    .delete()
    .match({ id: entryId, player_id: user.id }) // SECURITY: Validation stricte de la propriété

  if (error) {
    console.error('Career Delete Error:', error)
    throw new Error('Erreur lors de la suppression')
  }

  revalidatePath('/', 'layout')
}