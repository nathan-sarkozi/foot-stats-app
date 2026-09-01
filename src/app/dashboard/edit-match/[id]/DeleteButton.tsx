'use client'

import { deleteMatch } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'

export default function DeleteButton({ matchId }: { matchId: string }) {
  return (
    <form action={deleteMatch} onSubmit={(e) => {
      if (!window.confirm('Supprimer définitivement ce match ?')) {
        e.preventDefault() 
      }
    }}>
      <input type="hidden" name="match_id" value={matchId} />
      
      {/* Utilisation de notre nouveau composant avec la variante 'danger' (rouge) */}
      <SubmitButton 
        defaultLabel="Supprimer le match" 
        loadingLabel="Suppression en cours..." 
        variant="danger" 
      />
    </form>
  )
}