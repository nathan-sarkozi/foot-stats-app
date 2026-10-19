import { z } from 'zod'
import { getCurrentSeason } from '@/utils/playerStats'
import type { Tables } from '@/types/supabase'

export type CareerEntry = Pick<Tables<'career_entries'>,
  | 'id' | 'player_id' | 'season_start' | 'season_end' | 'is_free_agent'
  | 'club' | 'category' | 'is_youth' | 'has_stats' | 'matches_played'
  | 'goals' | 'assists' | 'yellow_cards' | 'red_cards'
>

export const careerEntryIdSchema = z.uuid().transform(id => id.toLowerCase())

export function getCareerSeasonYears(existingYear?: number, now = new Date()) {
  const currentYear = getCurrentSeason(now).startYear
  const years = Array.from({ length: 30 }, (_, index) => currentYear - index)
  if (existingYear !== undefined && Number.isInteger(existingYear) && !years.includes(existingYear)) {
    years.push(existingYear)
    years.sort((a, b) => b - a)
  }
  return years
}

const integerField = (maximum: number) => z.string('Ce champ est obligatoire.')
  .trim().regex(/^\d+$/, 'Saisissez un nombre entier positif ou nul.')
  .transform(Number).pipe(z.number().int().min(0).max(maximum, `La valeur maximale est ${maximum}.`))

function checkboxValue(formData: FormData, name: string) {
  const value = formData.get(name)
  if (value === null) return false
  return value === 'on' || value === 'true' ? true : undefined
}

export function parseCareerFormData(formData: FormData, existingSeasonStart?: number, now = new Date()) {
  const isFreeAgent = checkboxValue(formData, 'is_free_agent')
  const hasStats = checkboxValue(formData, 'has_stats')
  const latestYear = Math.max(2030, getCurrentSeason(now).startYear)
  const schema = z.object({
    season_start: z.string('La saison est obligatoire.').trim()
      .regex(/^-?\d+$/, 'La saison doit être une année entière.')
      .transform(Number).pipe(z.number().int())
      .refine(year => (year >= 1990 && year <= latestYear) || year === existingSeasonStart,
        'Cette saison est hors de la période autorisée.'),
    is_free_agent: z.boolean(),
    club: z.string('Indiquez un club ou sélectionnez « sans club ».').trim().max(100, 'Le club ne peut pas dépasser 100 caractères.').nullable(),
    category: z.string('La catégorie doit être un texte.').trim().max(50, 'La catégorie ne peut pas dépasser 50 caractères.').nullable(),
    is_youth: z.boolean(),
    has_stats: z.boolean(),
    matches_played: integerField(100),
    goals: integerField(200),
    assists: integerField(200),
    yellow_cards: integerField(50),
    red_cards: integerField(20),
  }).superRefine((data, context) => {
    if (!data.is_free_agent && !data.club) {
      context.addIssue({ code: 'custom', path: ['club'], message: 'Indiquez un club ou sélectionnez « sans club ».' })
    }
    if (data.has_stats && data.matches_played === 0) {
      for (const field of ['goals', 'assists'] as const) {
        if (data[field] > 0) {
          context.addIssue({ code: 'custom', path: [field], message: 'Les buts et passes doivent être nuls lorsqu’aucun match n’a été joué.' })
        }
      }
    }
  })

  return schema.safeParse({
    season_start: formData.get('season_start'),
    is_free_agent: isFreeAgent,
    club: isFreeAgent === true ? null : formData.get('club'),
    category: isFreeAgent === true ? null : (formData.get('category') ?? null),
    is_youth: checkboxValue(formData, 'is_youth'),
    has_stats: hasStats,
    ...Object.fromEntries(['matches_played', 'goals', 'assists', 'yellow_cards', 'red_cards'].map(name => [
      name, hasStats === true ? formData.get(name) : '0',
    ])),
  })
}
