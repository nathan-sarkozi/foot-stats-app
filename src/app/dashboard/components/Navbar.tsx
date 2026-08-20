import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="bg-indigo-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* 1. Logo & Primary Navigation Links */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl font-bold tracking-tight">
              FootStats
            </Link>
            
            <div className="flex space-x-4">
              <Link 
                href="/dashboard" 
                className="hover:bg-indigo-500 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Dashboard
              </Link>
              <Link 
                href="/dashboard/community" 
                className="hover:bg-indigo-500 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Community
              </Link>
            </div>
          </div>
          
          {/* 2. Secondary Navigation (Placeholder for user actions) */}
          <div className="flex items-center">
             <span className="text-sm opacity-80 font-medium">My Account</span>
          </div>

        </div>
      </div>
    </nav>
  )
}