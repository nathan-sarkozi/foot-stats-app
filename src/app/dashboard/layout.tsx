import Navbar from './components/Navbar'

// Strict typing for layout props
interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Persistent global navigation menu */}
      <Navbar />
      
      {/* Dynamic page content injected here by Next.js router */}
      <main>
        {children}
      </main>
    </div>
  )
}