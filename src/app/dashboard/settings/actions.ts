'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // 1. Extract and sanitize payload
  const displayName = formData.get('display_name') as string
  const club = formData.get('club') as string
  const category = formData.get('category') as string
  const preferredPosition = formData.get('preferred_position') as string

  if (!displayName || displayName.trim().length === 0) {
    throw new Error('Display name is required')
  }

  // 2. Execute Update (RLS guarantees the user can only update their own row)
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName.trim(),
      club: club ? club.trim() : null,
      category: category ? category.trim() : null,
      preferred_position: preferredPosition || null,
    })
    .eq('id', user.id)

  if (error) {
    console.error('Profile Update Error:', error.message)
    throw new Error('Failed to update profile')
  }

  // 3. Purge cache to reflect changes everywhere (Navbar, Community, Profile)
  revalidatePath('/', 'layout')
}