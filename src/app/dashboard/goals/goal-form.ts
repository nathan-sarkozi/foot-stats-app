import { z } from 'zod'
import { GOAL_METRICS } from '@/utils/seasonGoals'

export const MAX_GOAL_TARGET = 2147483647
export const goalIdSchema = z.uuid().transform(id => id.toLowerCase())

const integerField = (maximum: number, message: string) => z.string(message).trim()
  .regex(/^\d+$/, message).transform(Number)
  .pipe(z.number().int().min(1, message).max(maximum, message))

const targetSchema = integerField(MAX_GOAL_TARGET, 'La cible doit être un entier strictement positif, inférieur ou égal à 2 147 483 647.')
const createSchema = z.object({
  season_start: integerField(9998, 'Choisis une saison valide.'),
  metric: z.enum(GOAL_METRICS, 'Choisis un type d’objectif valide.'),
  target: targetSchema,
})
const updateSchema = z.object({ goal_id: goalIdSchema, target: targetSchema })

export function parseCreateGoalFormData(formData: FormData) {
  return createSchema.safeParse({
    season_start: formData.get('season_start'), metric: formData.get('metric'), target: formData.get('target'),
  })
}

export function parseUpdateGoalFormData(formData: FormData) {
  return updateSchema.safeParse({ goal_id: formData.get('goal_id'), target: formData.get('target') })
}
