import { z } from 'zod'

export const resourceIdSchema = z.uuid()

export function checkReadError(
  error: { code?: string; message: string } | null,
  context: string,
) {
  if (!error) return
  console.error(context, { code: error.code, message: error.message })
  throw new Error('Impossible de charger les données. Réessaie dans quelques instants.')
}
