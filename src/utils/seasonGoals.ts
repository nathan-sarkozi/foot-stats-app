import type { Tables } from '@/types/supabase'
import type { SeasonReview } from './seasonReview'

export const GOAL_METRICS = ['goals', 'assists', 'appearances', 'motm'] as const
export type GoalMetric = typeof GOAL_METRICS[number]
export type SeasonGoal = Tables<'season_goals'>

export const GOAL_LABELS = {
  goals: { label: 'Buts', singular: 'But', unit: 'buts' },
  assists: { label: 'Passes décisives', singular: 'Passe décisive', unit: 'passes décisives' },
  appearances: { label: 'Participations', singular: 'Participation', unit: 'participations' },
  motm: { label: 'MOTM', singular: 'Distinction MOTM', unit: 'distinctions MOTM' },
} satisfies Record<GoalMetric, { label: string; singular: string; unit: string }>

export type GoalProgression = {
  kind: 'exact' | 'minimum' | 'unknown' | 'empty'
  status: 'in-progress' | 'achieved' | 'exceeded' | 'indeterminate' | 'no-matches'
  value: number | null
  percentage: number | null
  barPercentage: number
  remaining: number | null
}

/** Goals use the recorded-match review only, never manual career totals.
 * A partial season exposes a confirmed lower bound rather than a false total.
 */
export function buildGoalProgression(review: SeasonReview, metric: GoalMetric, target: number): GoalProgression {
  if (!Number.isSafeInteger(target) || target <= 0) throw new RangeError('La cible doit être un entier strictement positif.')
  const noValue = (kind: 'empty' | 'unknown'): GoalProgression => ({
    kind, status: kind === 'empty' ? 'no-matches' : 'indeterminate', value: null,
    percentage: null, barPercentage: 0, remaining: null,
  })
  if (review.rows.length === 0) return noValue('empty')

  const exact = review.metrics[metric]
  const minimums = {
    goals: review.summary.totalGoals,
    assists: review.summary.totalAssists,
    appearances: review.summary.matchesPlayed,
    motm: review.summary.totalMotm,
  }
  const value = exact ?? minimums[metric]
  if (exact === null && value <= 0) return noValue('unknown')

  const percentage = value / target * 100
  return {
    kind: exact === null ? 'minimum' : 'exact',
    status: value > target ? 'exceeded' : value === target ? 'achieved' : 'in-progress',
    value, percentage, barPercentage: Math.min(100, percentage),
    // With incomplete data the distance to the target is not known exactly.
    remaining: exact === null ? null : Math.max(0, target - value),
  }
}
