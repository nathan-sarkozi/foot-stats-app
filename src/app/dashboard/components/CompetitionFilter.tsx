'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { COMPETITIONS, parseCompetitionParams, type Competition } from '@/utils/competitionFilters'
import s from '../stade.module.css'

// Defined OUTSIDE the main component to prevent memory leaks and infinite re-mounts
interface FilterButtonProps {
  value: Competition
  label: string
  isActive: boolean
  onClick: (value: Competition) => void
  variant?: 'default' | 'stade'
}

const FilterButton = ({ value, label, isActive, onClick, variant }: FilterButtonProps) => (
  <button
    type="button"
    aria-pressed={isActive}
    onClick={() => onClick(value)}
    className={variant === 'stade' ? s.filterButton : `cursor-pointer px-4 py-2 text-sm font-medium rounded-full transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
    }`}
  >
    {label}
  </button>
)

export default function CompetitionFilter({ variant = 'default', available = [...COMPETITIONS], selected }: { variant?: 'default' | 'stade', available?: readonly Competition[], selected?: readonly Competition[] } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentComps = useMemo(
    () => {
      const valid = parseCompetitionParams(searchParams.getAll('comps')).filter(comp => available.includes(comp))
      return selected ? [...selected] : valid
    },
    [searchParams, available, selected],
  )

  const toggleCompetition = useCallback((comp: Competition) => {
    let newComps: Competition[]

    if (currentComps.includes(comp)) {
      newComps = currentComps.length > 1 ? currentComps.filter(c => c !== comp) : currentComps
    } else {
      newComps = [...currentComps, comp]
    }

    const params = new URLSearchParams(searchParams.toString())
    if (newComps.length === available.length) {
      params.delete('comps')
    } else {
      params.set('comps', newComps.join(','))
    }

    router.push(`?${params.toString()}`, { scroll: false })
  }, [currentComps, router, searchParams, available])

  return (
    <div className={variant === 'stade' ? s.competitionFilters : 'flex flex-wrap gap-2 mb-6'} role="group" aria-label="Compétitions incluses dans les statistiques">
      {available.includes('LEAGUE') && <FilterButton
        variant={variant}
        value="LEAGUE"
        label="Championnat"
        isActive={currentComps.includes('LEAGUE')}
        onClick={toggleCompetition}
      />}
      {available.includes('CUP') && <FilterButton
        variant={variant}
        value="CUP"
        label="Coupe"
        isActive={currentComps.includes('CUP')}
        onClick={toggleCompetition}
      />}
      {available.includes('FRIENDLY') && <FilterButton
        variant={variant}
        value="FRIENDLY"
        label="Amical"
        isActive={currentComps.includes('FRIENDLY')}
        onClick={toggleCompetition}
      />}
    </div>
  )
}
