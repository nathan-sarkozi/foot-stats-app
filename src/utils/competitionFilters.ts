export const COMPETITIONS = ['LEAGUE', 'CUP', 'FRIENDLY'] as const

export type Competition = typeof COMPETITIONS[number]

// Both Next.js page searchParams and URLSearchParams.getAll can supply arrays.
// Keep historical empty URLs equivalent to an absent filter (all competitions).
export function parseCompetitionParams(value: unknown): Competition[] {
  if (value === undefined || value === null || value === '') return [...COMPETITIONS]

  const values: unknown[] = Array.isArray(value) ? value : [value]
  if (values.length === 0 || values.every(entry => entry === '')) return [...COMPETITIONS]

  const selected = new Set<Competition>()
  for (const entry of values) {
    if (typeof entry !== 'string') continue
    for (const token of entry.split(',')) {
      const competition = COMPETITIONS.find(value => value === token.trim())
      if (competition) selected.add(competition)
    }
  }
  return [...selected]
}
