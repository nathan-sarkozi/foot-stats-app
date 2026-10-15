'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { matchIdSchema, parseMatchFormData, toMatchRpcArgs } from '../match-form'

export async function addMatch(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const validatedFields = parseMatchFormData(formData)

  if (!validatedFields.success) {
    console.error('Validation Error:', validatedFields.error.flatten().fieldErrors)
    throw new Error('Invalid form data provided')
  }

  const { data, error } = await supabase.rpc(
    'save_match_with_statistics',
    toMatchRpcArgs(validatedFields.data),
  )

  if (error || !matchIdSchema.safeParse(data).success) {
    console.error('Match Creation Error:', error)
    throw new Error('Failed to create match and statistics')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
