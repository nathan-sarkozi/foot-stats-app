import Navbar from './components/Navbar'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    // 1. Fond légèrement grisé pour faire ressortir les cartes blanches
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      
      {/* 2. Conteneur strict : limite la largeur et centre au milieu de l'écran */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </div>
  )
}