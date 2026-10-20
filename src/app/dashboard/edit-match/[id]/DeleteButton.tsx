'use client'

import { deleteMatch } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import ActionForm from '@/components/ActionForm'

export default function DeleteButton({ matchId }: { matchId: string }) {
  return (
    <ActionForm action={deleteMatch} variant="stade" onSubmit={(e) => {
      if (!window.confirm('Supprimer définitivement ce match ?')) {
        e.preventDefault() 
      }
    }}>
      <input type="hidden" name="match_id" value={matchId} />
      
      <SubmitButton 
        defaultLabel="Supprimer le match" 
        loadingLabel="Suppression en cours..." 
        variant="danger" 
        appearance="stade"
      />
    </ActionForm>
  )
}
