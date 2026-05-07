import { addMatch } from './actions'
import Link from 'next/link'

export default function AddMatchPage() {
  // Shared CSS classes for inputs to ensure consistent contrast and styling
  const inputBaseClasses = "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Ajouter un match</h2>
        <Link 
          href="/dashboard" 
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          &larr; Retour au tableau de bord
        </Link>
      </div>

      <form action={addMatch} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-8">
        
        {/* SECTION 1: Match Details */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Informations du match</h3>
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div>
              <label htmlFor="match_date" className="block text-sm font-medium text-gray-700">Date *</label>
              <input type="date" name="match_date" id="match_date" required className={inputBaseClasses} />
            </div>

            <div>
              <label htmlFor="opponent" className="block text-sm font-medium text-gray-700">Adversaire *</label>
              <input type="text" name="opponent" id="opponent" placeholder="Ex: FC Dev" required className={inputBaseClasses} />
            </div>

            <div>
              <label htmlFor="competition_type" className="block text-sm font-medium text-gray-700">Compétition *</label>
              {/* Values remain in English to match the SQL CHECK constraint ('LEAGUE', 'CUP', 'FRIENDLY') */}
              <select id="competition_type" name="competition_type" required className={inputBaseClasses}>
                <option value="LEAGUE">Championnat</option>
                <option value="CUP">Coupe</option>
                <option value="FRIENDLY">Amical</option>
              </select>
            </div>

            <div className="flex space-x-4">
              <div className="w-1/2">
                <label htmlFor="team_score" className="block text-sm font-medium text-gray-700">Notre score</label>
                <input type="number" min="0" name="team_score" id="team_score" defaultValue="0" required className={inputBaseClasses} />
              </div>
              <div className="w-1/2">
                <label htmlFor="opponent_score" className="block text-sm font-medium text-gray-700">Score adverse</label>
                <input type="number" min="0" name="opponent_score" id="opponent_score" defaultValue="0" required className={inputBaseClasses} />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Player Statistics */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Tes statistiques</h3>
          
          <div className="mb-6 flex items-center">
            <input id="has_played" name="has_played" type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <label htmlFor="has_played" className="ml-2 block text-sm text-gray-900">
              J&apos;ai joué ce match
            </label>
          </div>

          <div className="grid grid-cols-2 gap-y-6 gap-x-4 sm:grid-cols-4">
            <div>
              <label htmlFor="minutes_played" className="block text-sm font-medium text-gray-700">Minutes</label>
              <input type="number" min="0" max="120" name="minutes_played" id="minutes_played" defaultValue="90" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="goals" className="block text-sm font-medium text-gray-700">Buts</label>
              <input type="number" min="0" name="goals" id="goals" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="assists" className="block text-sm font-medium text-gray-700">Passes dé.</label>
              <input type="number" min="0" name="assists" id="assists" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="yellow_cards" className="block text-sm font-medium text-gray-700">Cartons jaunes</label>
              <input type="number" min="0" max="2" name="yellow_cards" id="yellow_cards" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="red_cards" className="block text-sm font-medium text-gray-700">Cartons rouges</label>
              <input type="number" min="0" max="1" name="red_cards" id="red_cards" defaultValue="0" className={inputBaseClasses} />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Enregistrer le match
          </button>
        </div>
      </form>
    </div>
  )
}