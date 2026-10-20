'use client'

import { motion } from 'framer-motion'
import s from '../stade.module.css'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  delay?: number
  highlight?: boolean
  variant?: 'default' | 'stade'
}

export default function StatCard({ title, value, subtitle, delay = 0, highlight = false, variant = 'default' }: StatCardProps) {
  if (variant === 'stade') return <article className={`${s.statCard} ${highlight ? s.statHighlight : ''}`}>
    <h3>{title}</h3><p className={s.statValue}>{value}</p>
    {subtitle && <p className={s.statSubtitle}>{subtitle}</p>}
  </article>

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      whileHover={{ y: -4, scale: 1.01 }}
      className={`relative overflow-hidden bg-white p-6 rounded-2xl border ${
        highlight ? 'border-indigo-500 shadow-indigo-100/50 shadow-lg' : 'border-slate-200 shadow-sm'
      } flex flex-col justify-center group cursor-default`}
    >
      {/* Effet visuel au survol (barre latérale gauche) */}
      <div className="absolute left-0 top-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Décoration de fond pour les cartes mises en avant */}
      {highlight && (
        <div className="absolute -top-4 -right-4 w-20 h-20 bg-indigo-50 rounded-full -z-10 opacity-50" />
      )}
      
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</h3>
      <p className="text-3xl font-extrabold text-slate-800 mt-2 tracking-tight">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1.5 font-medium">{subtitle}</p>}
    </motion.div>
  )
}
