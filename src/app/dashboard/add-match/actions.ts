'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { matchIdSchema, parseMatchFormData, toMatchRpcArgs } from '../match-form'
import type { FormState } from '@/utils/formState'

export async function addMatch(_previousState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('Session verification failed', { code: authError.code, status: authError.status, name: authError.name })
    return { status: 'error', message: 'Impossible de vérifier ta connexion. Réessaie dans quelques instants.' }
  }

  if (!user) return { status: 'error', message: 'Ta session a expiré. Reconnecte-toi avant de sauvegarder.' }

  const validatedFields = parseMatchFormData(formData)

  if (!validatedFields.success) {
    console.error('Validation Error:', validatedFields.error.flatten().fieldErrors)
    return { status: 'error', message: 'Vérifie la date, les scores et les statistiques saisies.' }
  }

  const { data, error } = await supabase.rpc(
    'save_match_with_statistics',
    toMatchRpcArgs(validatedFields.data),
  )

  if (error || !matchIdSchema.safeParse(data).success) {
    console.error('Match Creation Error:', error)
    return { status: 'error', message: 'Le match n’a pas pu être enregistré. Réessaie dans quelques instants.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
