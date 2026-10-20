'use client'

import { useId, useState } from 'react'
import { AVATAR_ACCEPT, getAvatarFileError } from '@/utils/avatar'
import s from './stadium.module.css'

interface AvatarInputProps {
  id: string
  className?: string
  required?: boolean
  variant?: 'default' | 'stade'
}

export default function AvatarInput({ id, className, required = false, variant = 'default' }: AvatarInputProps) {
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
      {error && <p id={errorId} role="alert" className={variant === 'stade' ? s.fieldError : 'text-sm text-red-700'}>{error}</p>}
    </>
  )
}
