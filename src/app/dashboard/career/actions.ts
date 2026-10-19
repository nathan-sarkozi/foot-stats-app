'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type { FormState } from '@/utils/formState'
import { careerEntryIdSchema, parseCareerFormData } from './career-form'

function databaseFailure(operation: string, error: { code?: string; message: string }): FormState {
  console.error(`Carrière : ${operation}`, { code: error.code, message: error.message })
  return { status: 'error', message: 'Impossible d’enregistrer cette opération. Réessayez dans quelques instants.' }
}

export async function saveCareerEntry(_previousState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { status: 'error', message: 'Votre session a expiré. Reconnectez-vous.' }

  const rawId = formData.get('entry_id')
  const entryId = rawId === null ? null : careerEntryIdSchema.safeParse(rawId)
  if (entryId && !entryId.success) return { status: 'error', message: 'Identifiant de saison invalide.' }
  const id = entryId?.success ? entryId.data : null

  let existingSeasonStart: number | undefined
  if (id) {
    const { data: existing, error } = await supabase.from('career_entries')
      .select('id, season_start').match({ id, player_id: user.id }).maybeSingle()
    if (error) return databaseFailure('lecture avant modification', error)
    if (!existing) return { status: 'error', message: 'Cette saison est introuvable ou ne vous appartient pas.' }
    existingSeasonStart = existing.season_start
  }

  const validated = parseCareerFormData(formData, existingSeasonStart)
  if (!validated.success) {
    return {
      status: 'error', message: 'Vérifiez les informations de la saison.',
      fieldErrors: validated.error.flatten().fieldErrors,
    }
  }
  const dbData = { ...validated.data, player_id: user.id, season_end: validated.data.season_start + 1 }

  if (id) {
    const { data, error } = await supabase.from('career_entries').update(dbData)
      .match({ id, player_id: user.id }).select('id').maybeSingle()
    if (error) return databaseFailure('modification', error)
    if (!data) return { status: 'error', message: 'Cette saison est introuvable ou ne vous appartient pas.' }
  } else {
    const { error } = await supabase.from('career_entries').insert(dbData)
    if (error) return databaseFailure('création', error)
  }

  revalidatePath('/', 'layout')
  if (id) redirect('/dashboard/career')
  return { status: 'success', message: 'La saison a été ajoutée à votre carrière.' }
}

export async function deleteCareerEntry(_previousState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { status: 'error', message: 'Votre session a expiré. Reconnectez-vous.' }

  const entryId = careerEntryIdSchema.safeParse(formData.get('entry_id'))
  if (!entryId.success) return { status: 'error', message: 'Identifiant de saison invalide.' }

  const { data, error } = await supabase.from('career_entries').delete()
    .match({ id: entryId.data, player_id: user.id }).select('id').maybeSingle()
  if (error) return databaseFailure('suppression', error)
  if (!data) return { status: 'error', message: 'Cette saison est introuvable ou ne vous appartient pas.' }

  revalidatePath('/', 'layout')
  return { status: 'success', message: 'La saison a été supprimée.' }
}
