'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { matchIdSchema, parseMatchFormData, toMatchRpcArgs } from '../../match-form'

export async function updateMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const matchId = matchIdSchema.safeParse(formData.get('match_id'))
  if (!matchId.success) throw new Error('Invalid match identifier')

  const validatedFields = parseMatchFormData(formData)

  if (!validatedFields.success) {
    console.error('Validation Error:', validatedFields.error.flatten().fieldErrors)
    throw new Error('Invalid form data provided')
  }

  const { data, error } = await supabase.rpc(
    'save_match_with_statistics',
    toMatchRpcArgs(validatedFields.data, matchId.data),
  )

  const savedMatchId = matchIdSchema.safeParse(data)
  if (error || !savedMatchId.success || savedMatchId.data !== matchId.data) {
    console.error('Match Update Error:', error)
    throw new Error('Failed to update match and statistics')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function deleteMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const matchId = matchIdSchema.safeParse(formData.get('match_id'))
  if (!matchId.success) throw new Error('Invalid match identifier')

  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId.data)
    .eq('player_id', user.id)

  if (error) {
    console.error('Delete Error:', error)
    throw new Error('Failed to delete match')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
