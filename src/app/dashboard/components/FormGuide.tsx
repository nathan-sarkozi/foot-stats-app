'use client'

import type { Tables } from '@/types/supabase'

interface FormGuideProps {
  recentMatches: Array<Pick<Tables<'matches'>, 'team_score' | 'opponent_score'>>
}

export default function FormGuide({ recentMatches }: FormGuideProps) {
  // Extract max 5 latest matches and reverse for chronological left-to-right reading
  const form = recentMatches.slice(0, 5).reverse()

  if (form.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-bold text-slate-400 mr-2 uppercase tracking-wider">Forme :</span>
      {form.map((match, i) => {
        const isWin = Number(match.team_score) > Number(match.opponent_score)
        const isDraw = match.team_score === match.opponent_score
        
        const bgColor = isWin ? 'bg-emerald-500' : isDraw ? 'bg-slate-400' : 'bg-red-500'
        const label = isWin ? 'V' : isDraw ? 'N' : 'D'

        return (
          <div 
            key={i} 
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ${bgColor}`}
            title={`${match.team_score} - ${match.opponent_score}`}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}
