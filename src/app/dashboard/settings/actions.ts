'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

// 1. SCHEMA DEFINITION: Strict validation rules
const ProfileSchema = z.object({
  display_name: z.string().trim().min(2, 'Name too short').max(50, 'Name too long'),
  club: z.string().trim().max(100).nullable(),
  category: z.string().trim().max(50).nullable(),
  preferred_position: z.enum(['BU', 'AG', 'AD', 'MOC', 'MC', 'MDC', 'DG', 'DD', 'DC', 'GB']).nullable(),
  foot_preference: z.enum(['Droitier', 'Gaucher', 'Ambidextre']).nullable(),
  jersey_number: z.coerce.number().min(1).max(99).nullable(),
  height: z.coerce.number().min(100).max(250).nullable(),
  weight: z.coerce.number().min(30).max(150).nullable(),
})

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // Helper to convert empty strings (from the form) to null for PostgreSQL
  const parseNullableString = (key: string) => {
    const val = formData.get(key) as string
    return val && val.trim() !== '' ? val.trim() : null
  }

  const parseNullableNumber = (key: string) => {
    const val = formData.get(key) as string
    return val && val.trim() !== '' ? val : null
  }

  // 2. DATA EXTRACTION
  const rawData = {
    display_name: formData.get('display_name'),
    club: parseNullableString('club'),
    category: parseNullableString('category'),
    preferred_position: parseNullableString('preferred_position'),
    foot_preference: parseNullableString('foot_preference'),
    jersey_number: parseNullableNumber('jersey_number'),
    height: parseNullableNumber('height'),
    weight: parseNullableNumber('weight'),
  }

  // 3. SAFE PARSING: Intercept and validate
  const validatedFields = ProfileSchema.safeParse(rawData)

  if (!validatedFields.success) {
    console.error('Profile Validation Error:', validatedFields.error.flatten().fieldErrors)
    throw new Error('Invalid profile data provided')
  }

  const cleanData = validatedFields.data

  // 4. DATABASE UPDATE (Strict RLS ensures user only updates their row)
  const { error } = await supabase
    .from('profiles')
    .update(cleanData)
    .eq('id', user.id)

  if (error) {
    console.error('Profile Update Error:', error.message)
    throw new Error('Failed to update profile')
  }

  revalidatePath('/', 'layout')
}