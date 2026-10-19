'use client'

import { useActionState, type FormHTMLAttributes } from 'react'
import { EMPTY_FORM_STATE, type FormState } from '@/utils/formState'

export function FormFeedback({ state }: { state: FormState }) {
  if (!state.message) return null
  const isError = state.status === 'error'
  const messages = Object.values(state.fieldErrors ?? {}).flat()

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`rounded-xl border p-3 text-sm ${isError
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
}

export default function ActionForm({ action, children, ...props }: ActionFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE)

  return (
    <form {...props} action={formAction} onReset={event => event.preventDefault()}>
      <FormFeedback state={state} />
      {children}
    </form>
  )
}
