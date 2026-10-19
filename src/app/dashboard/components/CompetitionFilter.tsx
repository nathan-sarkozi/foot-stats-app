'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { parseCompetitionParams, type Competition } from '@/utils/competitionFilters'

// Defined OUTSIDE the main component to prevent memory leaks and infinite re-mounts
interface FilterButtonProps {
  value: Competition
  label: string
  isActive: boolean
  onClick: (value: Competition) => void
}

const FilterButton = ({ value, label, isActive, onClick }: FilterButtonProps) => (
  <button
    onClick={() => onClick(value)}
    className={`cursor-pointer px-4 py-2 text-sm font-medium rounded-full transition-colors ${
      isActive 
        ? 'bg-indigo-600 text-white shadow-sm' 
        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
    }`}
  >
    {label}
  </button>
)

export default function CompetitionFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const currentComps = useMemo(
    () => parseCompetitionParams(searchParams.getAll('comps')),
    [searchParams],
  )

  const toggleCompetition = useCallback((comp: Competition) => {
    let newComps: Competition[]
    
    if (currentComps.includes(comp)) {
      newComps = currentComps.length > 1 ? currentComps.filter(c => c !== comp) : currentComps
    } else {
      newComps = [...currentComps, comp]
    }

    const params = new URLSearchParams(searchParams.toString())
    if (newComps.length === 3) {
      params.delete('comps')
    } else {
      params.set('comps', newComps.join(','))
    }
    
    router.push(`?${params.toString()}`)
  }, [currentComps, router, searchParams])

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <FilterButton 
        value="LEAGUE" 
        label="Championnat" 
        isActive={currentComps.includes('LEAGUE')} 
        onClick={toggleCompetition} 
      />
      <FilterButton 
        value="CUP" 
        label="Coupe" 
        isActive={currentComps.includes('CUP')} 
        onClick={toggleCompetition} 
      />
      <FilterButton 
        value="FRIENDLY" 
        label="Amical" 
        isActive={currentComps.includes('FRIENDLY')} 
        onClick={toggleCompetition} 
      />
    </div>
  )
}
