'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // 1. Extract required data
  const displayName = formData.get('display_name') as string
  if (!displayName || displayName.trim().length === 0) {
    throw new Error('Display name is required')
  }

  // 2. Extract optional football & physical data
  const club = formData.get('club') as string
  const category = formData.get('category') as string
  const preferredPosition = formData.get('preferred_position') as string
  const footPreference = formData.get('foot_preference') as string
  
  // Parse numeric values safely
  const jerseyNumber = formData.get('jersey_number') ? parseInt(formData.get('jersey_number') as string) : null
  const height = formData.get('height') ? parseInt(formData.get('height') as string) : null
  const weight = formData.get('weight') ? parseInt(formData.get('weight') as string) : null

  // 3. Execute Update
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName.trim(),
      club: club ? club.trim() : null,
      category: category ? category.trim() : null,
      preferred_position: preferredPosition || null,
      foot_preference: footPreference || null,
      jersey_number: jerseyNumber,
      height: height,
      weight: weight,
    })
    .eq('id', user.id)

  if (error) {
    console.error('Profile Update Error:', error.message)
    throw new Error('Failed to update profile')
  }

  revalidatePath('/', 'layout')
}