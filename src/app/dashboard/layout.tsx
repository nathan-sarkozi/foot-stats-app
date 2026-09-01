import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation' // <-- NOUVEL IMPORT
import Navbar from './components/Navbar'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // SÉCURITÉ GLOBALE DU DOSSIER DASHBOARD
  if (!user) {
    redirect('/login')
  }

  let userInitials = "FS"
  
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
      
    if (data && data.display_name) {
      userInitials = data.display_name.substring(0, 2).toUpperCase()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar initials={userInitials} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </div>
  )
}