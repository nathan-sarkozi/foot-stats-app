'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

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

  const parseNullableString = (key: string) => {
    const val = formData.get(key) as string
    return val && val.trim() !== '' ? val.trim() : null
  }

  const parseNullableNumber = (key: string) => {
    const val = formData.get(key) as string
    return val && val.trim() !== '' ? val : null
  }

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

  const validatedFields = ProfileSchema.safeParse(rawData)

  if (!validatedFields.success) {
    console.error('Profile Validation Error:', validatedFields.error.flatten().fieldErrors)
    throw new Error('Invalid profile data provided')
  }

  const cleanData = validatedFields.data

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

// SECURITY: Strict file validation to prevent malicious uploads (CWE-434)
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]

export async function updateAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const file = formData.get('avatar') as File
  if (!file || file.size === 0) throw new Error('No file provided')

  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 2MB limit')
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Invalid file type. Only JPG, PNG and WEBP are allowed.')

  // Path Traversal prevention: generate a random UUID for the file name
  const fileExtension = file.name.split('.').pop()
  const fileName = `${crypto.randomUUID()}.${fileExtension}`
  const filePath = `${user.id}/${fileName}`

  // 1. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true })

  if (uploadError) {
    console.error('Upload Error:', uploadError)
    throw new Error('Failed to upload image')
  }

  // 2. Retrieve public URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  // 3. Update profile record
  const { error: dbError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id)

  if (dbError) throw new Error('Failed to link avatar to profile')

  revalidatePath('/', 'layout')
}