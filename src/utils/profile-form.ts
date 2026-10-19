import { z } from 'zod'

export const profileSchema = z.object({
  display_name: z.string({ error: 'Saisis un nom valide.' }).trim()
    .min(2, 'Le nom doit contenir au moins 2 caractères.').max(50, 'Le nom est limité à 50 caractères.'),
  club: z.string({ error: 'Saisis un club valide.' }).trim().max(100, 'Le club est limité à 100 caractères.').nullable(),
  category: z.string({ error: 'Saisis une catégorie valide.' }).trim().max(50, 'La catégorie est limitée à 50 caractères.').nullable(),
  preferred_position: z.enum(['BU', 'AG', 'AD', 'MOC', 'MC', 'MDC', 'DG', 'DD', 'DC', 'GB'], {
    error: 'Sélectionne un poste valide.',
  }).nullable(),
  foot_preference: z.enum(['Droitier', 'Gaucher', 'Ambidextre'], {
    error: 'Sélectionne un pied fort valide.',
  }).nullable(),
  jersey_number: z.coerce.number({ error: 'Saisis un numéro de maillot valide.' })
    .int('Le numéro de maillot doit être entier.').min(1, 'Le numéro minimum est 1.').max(99, 'Le numéro maximum est 99.').nullable(),
  height: z.coerce.number({ error: 'Saisis une taille valide.' })
    .int('La taille doit être entière.').min(100, 'La taille minimum est 100 cm.').max(250, 'La taille maximum est 250 cm.').nullable(),
  weight: z.coerce.number({ error: 'Saisis un poids valide.' })
    .int('Le poids doit être entier.').min(30, 'Le poids minimum est 30 kg.').max(150, 'Le poids maximum est 150 kg.').nullable(),
})

function optionalValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() || null : value
}

export function parseProfileFormData(formData: FormData) {
  return profileSchema.safeParse({
    display_name: formData.get('display_name'),
    club: optionalValue(formData, 'club'),
    category: optionalValue(formData, 'category'),
    preferred_position: optionalValue(formData, 'preferred_position'),
    foot_preference: optionalValue(formData, 'foot_preference'),
    jersey_number: optionalValue(formData, 'jersey_number'),
    height: optionalValue(formData, 'height'),
    weight: optionalValue(formData, 'weight'),
  })
}
