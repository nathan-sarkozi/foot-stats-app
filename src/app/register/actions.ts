'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache' // <-- 1. IMPORT OBLIGATOIRE

export async function registerUser(formData: FormData) {
  const supabase = await createClient()
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  // 1. Création du compte (Cela déclenche automatiquement notre Trigger SQL)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (authError || !authData.user) {
    console.error('Erreur Auth:', authError)
    // Redirection vers le dossier racine /register
    redirect('/register?error=Erreur lors de la création du compte')
  }

  // 2. Récupération des données du formulaire fantôme
  const profilePayload = {
    display_name: formData.get('display_name') as string,
    club: formData.get('club') as string || null,
    category: formData.get('category') as string || null,
    preferred_position: formData.get('preferred_position') as string || null,
    foot_preference: formData.get('foot_preference') as string || null,
    jersey_number: formData.get('jersey_number') ? parseInt(formData.get('jersey_number') as string) : null,
    height: formData.get('height') ? parseInt(formData.get('height') as string) : null,
    weight: formData.get('weight') ? parseInt(formData.get('weight') as string) : null,
  }

  // 3. Mise à jour immédiate du profil généré par le Trigger
  const { error: profileError } = await supabase
    .from('profiles')
    .update(profilePayload)
    .eq('id', authData.user.id)

  if (profileError) {
    console.error('Erreur Profile Update:', profileError)
  }

  // 4. LE CORRECTIF EST ICI : Forcer Next.js à re-rendre la page avec la nouvelle session
  revalidatePath('/', 'layout')
  
  redirect('/dashboard')
}