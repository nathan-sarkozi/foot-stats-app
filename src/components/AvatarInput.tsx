'use client'

import { useId, useState } from 'react'
import { AVATAR_ACCEPT, getAvatarFileError } from '@/utils/avatar'

interface AvatarInputProps {
  id: string
  className?: string
  required?: boolean
}

export default function AvatarInput({ id, className, required = false }: AvatarInputProps) {
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  return (
    <>
      <input
        type="file"
        id={id}
        name="avatar"
        accept={AVATAR_ACCEPT}
        required={required}
        className={className}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={event => {
          const input = event.currentTarget
          const message = getAvatarFileError(input.files?.[0] ?? null, !required)
          // Native form validation prevents sending an oversized request to
          // Vercel, which would reject it before the Server Action can respond.
          input.setCustomValidity(message ?? '')
          setError(message)
          if (message) input.reportValidity()
        }}
      />
      {error && <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p>}
    </>
  )
}
