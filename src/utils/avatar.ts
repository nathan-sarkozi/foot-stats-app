// Leave room for multipart fields below Vercel's 4.5 MB request limit.
export const MAX_AVATAR_SIZE_BYTES = 4 * 1024 * 1024
export const AVATAR_SIZE_LABEL = '4 Mio'
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp'

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function getAvatarExtension(mimeType: string): string | undefined {
  return Object.hasOwn(IMAGE_EXTENSIONS, mimeType) ? IMAGE_EXTENSIONS[mimeType] : undefined
}

export function getAvatarFileError(value: FormDataEntryValue | null, optional = false): string | null {
  if (value === null || (value instanceof File && value.size === 0)) {
    return optional ? null : 'Sélectionne une image.'
  }
  if (!(value instanceof File)) return 'Sélectionne une image JPG, PNG ou WebP.'
  if (value.size > MAX_AVATAR_SIZE_BYTES) return `La photo ne doit pas dépasser ${AVATAR_SIZE_LABEL}. Choisis une image plus légère.`
  if (!getAvatarExtension(value.type)) return 'La photo doit être au format JPG, PNG ou WebP.'
  return null
}
