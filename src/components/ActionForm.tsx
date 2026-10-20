'use client'

import { useActionState, useEffect, useRef, type FormHTMLAttributes } from 'react'
import { EMPTY_FORM_STATE, type FormState } from '@/utils/formState'
import s from './stadium.module.css'

export function FormFeedback({ state, variant = 'default' }: { state: FormState; variant?: 'default' | 'stade' }) {
  if (!state.message) return null
  const isError = state.status === 'error'
  const messages = Object.values(state.fieldErrors ?? {}).flat()

  return (
    <div
      role={isError ? 'alert' : 'status'}
      tabIndex={variant === 'stade' && isError ? -1 : undefined}
      className={variant === 'stade' ? `${s.feedback} ${isError ? s.feedbackError : s.feedbackSuccess}` : `rounded-xl border p-3 text-sm ${isError
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
    >
      <p>{state.message}</p>
      {messages.length > 0 && (
        <ul className="mt-2 list-inside list-disc">
          {messages.map((message, index) => <li key={index}>{message}</li>)}
        </ul>
      )}
    </div>
  )
}

interface ActionFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'action'> {
  action: (previousState: FormState, formData: FormData) => Promise<FormState>
  variant?: 'default' | 'stade'
}

export default function ActionForm({ action, children, variant = 'default', ...props }: ActionFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (variant === 'stade' && state.status === 'error') {
      formRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus()
    }
  }, [state, variant])

  return (
    <form {...props} ref={formRef} action={formAction} onReset={event => event.preventDefault()}>
      <FormFeedback state={state} variant={variant} />
      {children}
    </form>
  )
}
