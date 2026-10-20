'use client'

import { useActionState } from 'react'
import { deleteCareerEntry } from '../actions'
import { EMPTY_FORM_STATE } from '@/utils/formState'
import { FormFeedback } from '@/components/ActionForm'
import ui from '@/components/stadium.module.css'

export default function DeleteCareerButton({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(deleteCareerEntry, EMPTY_FORM_STATE)
  return (
    <form action={action} onReset={event => event.preventDefault()} onSubmit={event => {
      if (!window.confirm('Supprimer définitivement cette saison de carrière ?')) event.preventDefault()
    }}>
      <input type="hidden" name="entry_id" value={entryId} />
      <button type="submit" disabled={pending} className={ui.dangerButton}>
        {pending ? 'Suppression...' : 'Supprimer'}
      </button>
      <FormFeedback state={state} variant="stade" />
    </form>
  )
}
