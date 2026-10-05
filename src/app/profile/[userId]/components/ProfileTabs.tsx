'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

export default function ProfileTabs({ userId }: { userId: string }) {
  const pathname = usePathname()
  
  const tabs = [
    { name: 'Saison Actuelle', href: `/profile/${userId}` },
    { name: 'Carrière', href: `/profile/${userId}/career` }
  ]

  return (
    <div className="flex space-x-1 border-b border-slate-200 mb-8">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              "relative px-6 py-4 text-sm font-bold transition-colors",
              isActive ? "text-indigo-600" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-t-xl"
            )}
          >
            {tab.name}
            {isActive && (
              <motion.div 
                layoutId="profile-tab-indicator" 
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" 
                initial={false}
              />
            )}
          </Link>
        )
      })}
    </div>
  )
}