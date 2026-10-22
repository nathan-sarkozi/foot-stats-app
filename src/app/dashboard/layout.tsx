import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from './components/Navbar'
import NavigationProvider from './components/NavigationProvider'
import { getCurrentSeason } from '@/utils/playerStats'
import navigation from './components/navigation.module.css'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  let userInitials = "FS"
  let avatarUrl = null
  let displayName = null
  
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single()
      
    if (data && data.display_name) {
      userInitials = data.display_name.substring(0, 2).toUpperCase()
      avatarUrl = data.avatar_url
      displayName = data.display_name
    }
  }

  // Pass initials and avatar to Navbar
  return (
    <NavigationProvider currentYear={getCurrentSeason().startYear}><div className={`min-h-screen bg-slate-50 ${navigation.withMobileNavigation}`}>
      <Navbar userId={user.id} initials={userInitials} avatarUrl={avatarUrl} displayName={displayName} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </div></NavigationProvider>
  )
}
