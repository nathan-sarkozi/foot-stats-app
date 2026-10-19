'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { matchIdSchema, parseMatchFormData, toMatchRpcArgs } from '../../match-form'
import type { FormState } from '@/utils/formState'

export async function updateMatch(_previousState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('Session verification failed', { code: authError.code, status: authError.status, name: authError.name })
    return { status: 'error', message: 'Impossible de vérifier ta connexion. Réessaie dans quelques instants.' }
  }

  if (!user) return { status: 'error', message: 'Ta session a expiré. Reconnecte-toi avant de sauvegarder.' }

  const matchId = matchIdSchema.safeParse(formData.get('match_id'))
  if (!matchId.success) return { status: 'error', message: 'L’identifiant du match est invalide. Recharge la page.' }

  const validatedFields = parseMatchFormData(formData)

  if (!validatedFields.success) {
    console.error('Validation Error:', validatedFields.error.flatten().fieldErrors)
    return { status: 'error', message: 'Vérifie la date, les scores et les statistiques saisies.' }
  }

  const { data, error } = await supabase.rpc(
    'save_match_with_statistics',
    toMatchRpcArgs(validatedFields.data, matchId.data),
  )

  const savedMatchId = matchIdSchema.safeParse(data)
  if (error || !savedMatchId.success || savedMatchId.data !== matchId.data) {
    console.error('Match Update Error:', error)
    return { status: 'error', message: 'Le match n’a pas pu être modifié. Réessaie dans quelques instants.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function deleteMatch(_previousState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('Session verification failed', { code: authError.code, status: authError.status, name: authError.name })
    return { status: 'error', message: 'Impossible de vérifier ta connexion. Réessaie dans quelques instants.' }
  }

  if (!user) return { status: 'error', message: 'Ta session a expiré. Reconnecte-toi avant de supprimer ce match.' }

  const matchId = matchIdSchema.safeParse(formData.get('match_id'))
  if (!matchId.success) return { status: 'error', message: 'L’identifiant du match est invalide. Recharge la page.' }

  const { data, error } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId.data)
    .eq('player_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Delete Error:', error)
    return { status: 'error', message: 'Le match n’a pas pu être supprimé. Réessaie dans quelques instants.' }
  }

  if (!data) return { status: 'error', message: 'Ce match est introuvable ou n’est plus accessible.' }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
