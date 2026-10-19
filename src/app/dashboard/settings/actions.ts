'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { parseProfileFormData } from '@/utils/profile-form'
import type { FormState } from '@/utils/formState'
import { getAvatarExtension, getAvatarFileError } from '@/utils/avatar'

export async function updateProfile(_previousState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('Session verification failed', { code: authError.code, status: authError.status, name: authError.name })
    return { status: 'error', message: 'Impossible de vérifier ta connexion. Réessaie dans quelques instants.' }
  }
  if (!user) return { status: 'error', message: 'Ta session a expiré. Reconnecte-toi avant de modifier ton profil.' }

  const validated = parseProfileFormData(formData)
  const rbfaValue = formData.get('rbfa_team_id')
  if (!validated.success || (rbfaValue !== null && typeof rbfaValue !== 'string')) {
    return { status: 'error', message: 'Vérifie les informations du profil.',
      ...(!validated.success ? { fieldErrors: validated.error.flatten().fieldErrors } : {}) }
  }

  // Preserve the existing team-ID and RBFA URL input behavior.
  const rawTeamId = typeof rbfaValue === 'string' ? rbfaValue.trim() : ''
  const rbfaTeamId = rawTeamId.match(/\/team\/(\d+)/)?.[1] ?? rawTeamId.replace(/\D/g, '')
  if (rbfaTeamId.length > 50) return { status: 'error', message: 'L’identifiant de l’équipe RBFA est trop long.' }

  const { data, error } = await supabase.from('profiles')
    .update({ ...validated.data, rbfa_team_id: rbfaTeamId || null })
    .eq('id', user.id).select('id').maybeSingle()

  if (error) {
    console.error('Profile update failed', { code: error.code, message: error.message })
    return { status: 'error', message: 'Le profil n’a pas pu être enregistré. Réessaie dans quelques instants.' }
  }
  if (!data) return { status: 'error', message: 'Ton profil est introuvable ou n’est plus accessible.' }

  revalidatePath('/', 'layout')
  redirect('/dashboard/settings?success=profile')
}

export async function updateAvatar(_previousState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('Session verification failed', { code: authError.code, status: authError.status, name: authError.name })
    return { status: 'error', message: 'Impossible de vérifier ta connexion. Réessaie dans quelques instants.' }
  }
  if (!user) return { status: 'error', message: 'Ta session a expiré. Reconnecte-toi avant de modifier ta photo.' }

  const file = formData.get('avatar')
  const fileError = getAvatarFileError(file)
  if (fileError) return { status: 'error', message: fileError }
  if (!(file instanceof File)) return { status: 'error', message: 'Sélectionne une image.' }
  const extension = getAvatarExtension(file.type)

  const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`
  const avatars = supabase.storage.from('avatars')
  const { error: uploadError } = await avatars.upload(filePath, file, { upsert: true })
  if (uploadError) {
    console.error('Avatar upload failed', { message: uploadError.message })
    return { status: 'error', message: 'La photo n’a pas pu être envoyée. Réessaie dans quelques instants.' }
  }

  const { data: { publicUrl } } = avatars.getPublicUrl(filePath)
  const { data, error } = await supabase.from('profiles').update({ avatar_url: publicUrl })
    .eq('id', user.id).select('id').maybeSingle()
  if (error || !data) {
    console.error('Avatar profile link failed', { code: error?.code, message: error?.message ?? 'No profile updated' })
    return { status: 'error', message: 'L’image a été envoyée, mais la photo du profil n’a pas pu être mise à jour. Réessaie plus tard.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard/settings?success=avatar')
}
