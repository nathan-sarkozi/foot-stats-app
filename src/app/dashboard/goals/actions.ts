'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import type { FormState } from '@/utils/formState'
import { goalIdSchema, parseCreateGoalFormData, parseUpdateGoalFormData } from './goal-form'

function databaseFailure(operation: string, code?: string): FormState {
  console.error('Season goal write failed', { operation, code: code ?? 'NO_DATA' })
  if (code === '23505') return { status: 'error', message: 'Un objectif de ce type existe déjà pour cette saison. Modifie sa cible.' }
  return { status: 'error', message: 'Impossible d’enregistrer cette opération. Réessaie dans quelques instants.' }
}

async function authenticatedClient() {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error) {
    console.error('Season goal session verification failed', { code: error.code ?? 'AUTH_ERROR' })
    return { client, user: null, failure: { status: 'error', message: 'Impossible de vérifier ta connexion. Réessaie dans quelques instants.' } satisfies FormState }
  }
  return {
    client, user,
    failure: user ? null : { status: 'error', message: 'Ta session a expiré. Reconnecte-toi pour gérer tes objectifs.' } satisfies FormState,
  }
}

export async function createSeasonGoal(_previousState: FormState, formData: FormData): Promise<FormState> {
  const { client, user, failure } = await authenticatedClient()
  if (failure || !user) return failure!

  const validated = parseCreateGoalFormData(formData)
  if (!validated.success) return {
    status: 'error', message: 'Vérifie les informations de ton objectif.', fieldErrors: validated.error.flatten().fieldErrors,
  }
  // player_id is derived from the authenticated JWT by PostgreSQL, not the form.
  const { data, error } = await client.from('season_goals').insert(validated.data).select('id').maybeSingle()
  if (error || !data) return databaseFailure('create', error?.code)
  revalidatePath('/dashboard/goals')
  return { status: 'success', message: 'Ton objectif a été ajouté à cette saison.' }
}

export async function updateSeasonGoal(_previousState: FormState, formData: FormData): Promise<FormState> {
  const { client, user, failure } = await authenticatedClient()
  if (failure || !user) return failure!

  const validated = parseUpdateGoalFormData(formData)
  if (!validated.success) return {
    status: 'error', message: 'Vérifie la cible de ton objectif.', fieldErrors: validated.error.flatten().fieldErrors,
  }
  const { data, error } = await client.from('season_goals').update({ target: validated.data.target })
    .match({ id: validated.data.goal_id, player_id: user.id }).select('id').maybeSingle()
  if (error) return databaseFailure('update', error.code)
  if (!data) return { status: 'error', message: 'Cet objectif est introuvable ou ne t’appartient pas.' }
  revalidatePath('/dashboard/goals')
  return { status: 'success', message: 'La cible de ton objectif a été modifiée.' }
}

export async function deleteSeasonGoal(_previousState: FormState, formData: FormData): Promise<FormState> {
  const { client, user, failure } = await authenticatedClient()
  if (failure || !user) return failure!

  const validated = goalIdSchema.safeParse(formData.get('goal_id'))
  if (!validated.success) return { status: 'error', message: 'Identifiant d’objectif invalide.' }
  const { data, error } = await client.from('season_goals').delete()
    .match({ id: validated.data, player_id: user.id }).select('id').maybeSingle()
  if (error) return databaseFailure('delete', error.code)
  if (!data) return { status: 'error', message: 'Cet objectif est introuvable ou ne t’appartient pas.' }
  revalidatePath('/dashboard/goals')
  return { status: 'success', message: 'Ton objectif a été supprimé. Tes statistiques sont conservées.' }
}
