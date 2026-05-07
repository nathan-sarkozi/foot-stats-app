import { updateMatch } from './actions'
import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import DeleteButton from './DeleteButton'

// Strict typing for the expected DB structure
interface MatchData {
  id: string
  match_date: string
  opponent: string
  team_score: number
  opponent_score: number
  competition_type: string
}

interface StatData {
  id: string
  has_played: boolean
  minutes_played: number
  goals: number
  assists: number
  yellow_cards: number
  matches: MatchData
}

// Next.js 15: params is a Promise
export default async function EditMatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  // Fetch the specific match and its related stats
  const { data, error } = await supabase
    .from('statistics')
    .select(`
      id,
      has_played,
      minutes_played,
      goals,
      assists,
      yellow_cards,
      matches!inner (
        id,
        match_date,
        opponent,
        team_score,
        opponent_score,
        competition_type
      )
    `)
    .eq('player_id', user.id)
    .eq('match_id', resolvedParams.id)
    .single()

  if (error || !data) {
    return <div className="text-red-500">Match introuvable.</div>
  }

  const stat = data as unknown as StatData
  const match = stat.matches

  const inputBaseClasses = "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Modifier le match</h2>
        <Link href="/dashboard" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          &larr; Retour au tableau de bord
        </Link>
      </div>

      <form action={updateMatch} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-8">
        {/* Hidden fields to pass IDs securely to the server action */}
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="stat_id" value={stat.id} />

        <div>
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Informations du match</h3>
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div>
              <label htmlFor="match_date" className="block text-sm font-medium text-gray-700">Date *</label>
              <input type="date" name="match_date" id="match_date" defaultValue={match.match_date} required className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="opponent" className="block text-sm font-medium text-gray-700">Adversaire *</label>
              <input type="text" name="opponent" id="opponent" defaultValue={match.opponent} required className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="competition_type" className="block text-sm font-medium text-gray-700">Compétition *</label>
              <select id="competition_type" name="competition_type" defaultValue={match.competition_type} required className={inputBaseClasses}>
                <option value="LEAGUE">Championnat</option>
                <option value="CUP">Coupe</option>
                <option value="FRIENDLY">Amical</option>
              </select>
            </div>
            <div className="flex space-x-4">
              <div className="w-1/2">
                <label htmlFor="team_score" className="block text-sm font-medium text-gray-700">Notre score</label>
                <input type="number" min="0" name="team_score" id="team_score" defaultValue={match.team_score} required className={inputBaseClasses} />
              </div>
              <div className="w-1/2">
                <label htmlFor="opponent_score" className="block text-sm font-medium text-gray-700">Score adverse</label>
                <input type="number" min="0" name="opponent_score" id="opponent_score" defaultValue={match.opponent_score} required className={inputBaseClasses} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Tes statistiques</h3>
          <div className="mb-6 flex items-center">
            <input id="has_played" name="has_played" type="checkbox" defaultChecked={stat.has_played} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <label htmlFor="has_played" className="ml-2 block text-sm text-gray-900">J&apos;ai joué ce match</label>
          </div>
          <div className="grid grid-cols-2 gap-y-6 gap-x-4 sm:grid-cols-4">
            <div>
              <label htmlFor="minutes_played" className="block text-sm font-medium text-gray-700">Minutes</label>
              <input type="number" min="0" max="120" name="minutes_played" id="minutes_played" defaultValue={stat.minutes_played} className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="goals" className="block text-sm font-medium text-gray-700">Buts</label>
              <input type="number" min="0" name="goals" id="goals" defaultValue={stat.goals} className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="assists" className="block text-sm font-medium text-gray-700">Passes dé.</label>
              <input type="number" min="0" name="assists" id="assists" defaultValue={stat.assists} className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="yellow_cards" className="block text-sm font-medium text-gray-700">Cartons jaunes</label>
              <input type="number" min="0" max="2" name="yellow_cards" id="yellow_cards" defaultValue="{stat.yellow_cards}" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="red_cards" className="block text-sm font-medium text-gray-700">Cartons rouges</label>
              <input type="number" min="0" max="1" name="red_cards" id="red_cards" defaultValue="{stat.red_cards}" className={inputBaseClasses} />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button type="submit" className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
            Mettre à jour le match
          </button>
        </div>
      </form>

      <div className="bg-red-50 p-6 rounded-lg border border-red-200">
        <h3 className="text-lg font-medium text-red-900">Zone de danger</h3>
        <p className="text-sm text-red-600 mb-4">Cette action est irréversible.</p>
        
        {/* On appelle le Client Component ici */}
        <DeleteButton matchId={match.id} />
        
      </div>
    </div>
  )
}