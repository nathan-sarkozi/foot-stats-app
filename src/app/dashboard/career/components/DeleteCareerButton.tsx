'use client'

import { useActionState } from 'react'
import { deleteCareerEntry } from '../actions'
import { EMPTY_FORM_STATE } from '@/utils/formState'
import { FormFeedback } from '@/components/ActionForm'

export default function DeleteCareerButton({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(deleteCareerEntry, EMPTY_FORM_STATE)
  return (
    <form action={action} onReset={event => event.preventDefault()}>
      <input type="hidden" name="entry_id" value={entryId} />
      <button type="submit" disabled={pending} className="text-sm font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
        {pending ? 'Suppression...' : 'Supprimer'}
      </button>
      <FormFeedback state={state} />
    </form>
  )
}
