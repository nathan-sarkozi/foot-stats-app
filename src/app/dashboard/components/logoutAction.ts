'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function logout() {
  const supabase = await createClient()
  
  // Détruit la session active dans les cookies du navigateur
  await supabase.auth.signOut()
  
  // Redirige vers la nouvelle page de login (à la racine)
  redirect('/login')
}