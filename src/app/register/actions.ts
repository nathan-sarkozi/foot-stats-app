'use server'

import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { parseProfileFormData } from '@/utils/profile-form'
import type { FormState } from '@/utils/formState'
import { getAvatarExtension, getAvatarFileError } from '@/utils/avatar'

export interface RegisterState extends FormState {
  accountCreated?: boolean
  needsConfirmation?: boolean
}

const CredentialsSchema = z.object({
  email: z.string({ error: 'Saisis une adresse e-mail valide.' }).trim().email('Saisis une adresse e-mail valide.'),
  password: z.string({ error: 'Saisis un mot de passe valide.' }).min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
})

function logRegistrationError(stage: string, error: unknown) {
  // Database/Auth messages can contain an e-mail, profile value or JWT. Log
  // only technical identifiers; never echo submitted values or raw errors.
  const details = typeof error === 'object' && error !== null ? error : {}
  console.error(`Registration ${stage} failed`, {
    code: 'code' in details && typeof details.code === 'string' ? details.code : undefined,
    status: 'status' in details && typeof details.status === 'number' ? details.status : undefined,
    name: 'name' in details && typeof details.name === 'string' ? details.name : undefined,
  })
}

function authErrorMessage(error: { code?: string; status?: number }) {
  if (error.code === 'user_already_exists' || error.code === 'email_exists') {
    return 'Cette adresse est déjà utilisée. Connecte-toi ou utilise une autre adresse.'
  }
  if (error.code === 'weak_password') {
    return 'Ce mot de passe ne respecte pas les exigences de sécurité. Choisis un mot de passe plus fort.'
  }
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.'
  }
  if (error.code === 'signup_disabled') return 'Les inscriptions sont temporairement désactivées.'
  return 'La création du compte a échoué. Réessaie dans quelques instants. Si tu as reçu un e-mail de confirmation, vérifie-le avant de réessayer.'
}

export async function registerUser(previousState: RegisterState, formData: FormData): Promise<RegisterState> {
  if (previousState.accountCreated) return previousState

  const profile = parseProfileFormData(formData)
  const credentials = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  const avatar = formData.get('avatar')
  const avatarError = getAvatarFileError(avatar, true)

  // Validate every input before creating an Auth user or writing to Storage.
  if (!profile.success || !credentials.success || avatarError) {
    return {
      status: 'error',
      message: 'Vérifie les champs indiqués avant de créer ton compte.',
      fieldErrors: {
        ...(!profile.success ? profile.error.flatten().fieldErrors : {}),
        ...(!credentials.success ? credentials.error.flatten().fieldErrors : {}),
        ...(avatarError ? { avatar: [avatarError] } : {}),
      },
    }
  }

  const supabase = await createClient()
  let accountCreated = false
  let avatarFailed = false

  try {
    const { data: authData, error: authError } = await supabase.auth.signUp(credentials.data)
    if (authError || !authData.user) {
      logRegistrationError('auth', authError)
      return { status: 'error', message: authErrorMessage(authError ?? {}) }
    }

    // With e-mail confirmation there is no authenticated session. Do not try
    // owner-only writes, nor reveal whether an address already exists.
    if (!authData.session || authData.user.identities?.length === 0) {
      return {
        status: 'success',
        message: 'Si cette adresse peut être inscrite, un e-mail de confirmation a été envoyé. Consulte ta boîte de réception, puis connecte-toi pour compléter ton profil dans les paramètres. Si tu as déjà un compte, connecte-toi directement.',
        accountCreated: true,
        needsConfirmation: true,
      }
    }

    accountCreated = true
    const userId = authData.user.id
    let avatarUrl: string | undefined
    if (avatar instanceof File && avatar.size > 0) {
      const filePath = `${userId}/${crypto.randomUUID()}.${getAvatarExtension(avatar.type)}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatar, { upsert: true })
      if (uploadError) {
        logRegistrationError('avatar upload', uploadError)
        avatarFailed = true
      } else {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
        avatarUrl = publicUrl
      }
    }

    const { data: savedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({ ...profile.data, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
      .eq('id', userId)
      .select('id')
      .maybeSingle()

    if (profileError || !savedProfile) {
      logRegistrationError('profile update', profileError ?? { code: 'PROFILE_ROW_MISSING' })
      revalidatePath('/', 'layout')
      return {
        status: 'error',
        message: 'Ton compte a été créé, mais ton profil n’a pas pu être complété. Ne crée pas un autre compte : ouvre les paramètres pour renseigner ton profil.',
        accountCreated: true,
      }
    }
  } catch (error) {
    logRegistrationError(accountCreated ? 'profile completion' : 'request', error)
    return {
      status: 'error',
      message: accountCreated
        ? 'Ton compte a été créé, mais la finalisation du profil a échoué. Ne recrée pas de compte : complète ton profil dans les paramètres.'
        : 'Le service d’inscription est momentanément indisponible. Vérifie ta boîte e-mail avant de réessayer, puis connecte-toi si le compte a été créé.',
      accountCreated,
    }
  }

  revalidatePath('/', 'layout')
  if (avatarFailed) {
    return {
      status: 'error',
      message: 'Ton compte et ton profil ont été créés, mais la photo n’a pas pu être enregistrée. Tu peux la renvoyer depuis les paramètres.',
      accountCreated: true,
    }
  }
  redirect('/dashboard')
}
