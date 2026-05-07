'use client'

import { deleteMatch } from './actions'

export default function DeleteButton({ matchId }: { matchId: string }) {
  return (
    // On utilise onSubmit plutôt que onClick pour intercepter la soumission du formulaire
    <form action={deleteMatch} onSubmit={(e) => {
      if (!window.confirm('Supprimer définitivement ce match ?')) {
        e.preventDefault() // Annule l'envoi au serveur si on clique sur "Annuler"
      }
    }}>
      <input type="hidden" name="match_id" value={matchId} />
      <button 
        type="submit" 
        className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
      >
        Supprimer le match
      </button>
    </form>
  )
}