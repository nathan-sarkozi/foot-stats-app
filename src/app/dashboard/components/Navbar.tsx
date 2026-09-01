'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

export default function Navbar() {
  const pathname = usePathname()

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/community', label: 'Communauté' }
  ]

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="bg-indigo-600 text-white p-1.5 rounded-lg group-hover:scale-105 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                  <path d="m4.93 4.93 4.24 4.24"/>
                  <path d="m14.83 14.83 4.24 4.24"/>
                  <path d="m14.83 9.17 4.24-4.24"/>
                  <path d="m14.83 9.17-4.24 4.24"/>
                  <path d="m4.93 19.07 4.24-4.24"/>
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">
                FootStats
              </span>
            </Link>
            
            {/* Nav Links with Animated Active State */}
            <div className="hidden md:flex space-x-1">
              {links.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link 
                    key={link.href}
                    href={link.href} 
                    className={cn(
                      "relative px-3 py-2 rounded-md text-sm font-medium transition-colors hover:text-indigo-600",
                      isActive ? "text-indigo-600" : "text-slate-600"
                    )}
                  >
                    {link.label}
                    {isActive && (
                      <motion.div
                        layoutId="navbar-active-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
          
          {/* Secondary Actions */}
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-600 text-sm font-bold shadow-sm">
              NS
            </div>
          </div>

        </div>
      </div>
    </nav>
  )
}