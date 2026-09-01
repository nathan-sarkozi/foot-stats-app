import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { updateMatch } from './actions' // <-- Mets './action' si ton fichier n'a pas de 's'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import DeleteButton from './DeleteButton'
import Link from 'next/link'

interface EditMatchProps {
  params: Promise<{
    id: string
  }>
}

export default async function EditMatchPage(props: EditMatchProps) {
  const resolvedParams = await props.params
  const matchId = resolvedParams.id

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Récupération des données existantes
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*, statistics(*)')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return <div className="p-8 text-center text-red-500 font-bold">Match introuvable.</div>
  }

  // Vérification de sécurité : le match appartient-il à l'utilisateur ?
  if (match.player_id !== user.id) {
    redirect('/dashboard')
  }

  const stat = match.statistics[0] || {}
  
  const inputBaseClasses = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm transition-all"
  const labelClasses = "block text-sm font-bold text-slate-700"

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12 pt-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Modifier le match</h2>
          <p className="text-slate-500 mt-2 text-sm">Met à jour les statistiques de cette rencontre.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">
            Annuler
          </Link>
          <DeleteButton matchId={matchId} />
        </div>
      </div>

      <form action={updateMatch} className="space-y-6">
        <input type="hidden" name="match_id" value={matchId} />

        {/* BLOC 1 : LE MATCH */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center gap-2">
            <span>⚽</span> Informations du match
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="match_date" className={labelClasses}>Date du match *</label>
              <input type="date" id="match_date" name="match_date" required defaultValue={match.match_date} className={inputBaseClasses} />
            </div>
            
            <div>
              <label htmlFor="opponent" className={labelClasses}>Adversaire *</label>
              <input type="text" id="opponent" name="opponent" required defaultValue={match.opponent} className={inputBaseClasses} />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="competition_type" className={labelClasses}>Compétition *</label>
              <select id="competition_type" name="competition_type" required defaultValue={match.competition_type} className={inputBaseClasses}>
                <option value="LEAGUE">Championnat (Réserve C)</option>
                <option value="CUP">Coupe</option>
                <option value="FRIENDLY">Amical</option>
              </select>
            </div>

            <div className="flex items-center gap-4 md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex-1">
                <label htmlFor="team_score" className={labelClasses}>Buts marqués (Équipe)</label>
                <input type="number" id="team_score" name="team_score" min="0" required defaultValue={match.team_score} className={inputBaseClasses} />
              </div>
              <span className="text-2xl font-bold text-slate-300 mt-6">-</span>
              <div className="flex-1">
                <label htmlFor="opponent_score" className={labelClasses}>Buts encaissés</label>
                <input type="number" id="opponent_score" name="opponent_score" min="0" required defaultValue={match.opponent_score} className={inputBaseClasses} />
              </div>
            </div>
          </div>
        </div>

        {/* BLOC 2 : TES STATISTIQUES */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center gap-2">
            <span>📊</span> Performances individuelles
          </h3>

          <div className="space-y-6">
            <div className="flex items-center gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
              <input type="checkbox" id="has_played" name="has_played" value="true" defaultChecked={stat.has_played} className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="has_played" className="font-bold text-indigo-900">J&apos;ai participé à ce match</label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="minutes_played" className={labelClasses}>Minutes jouées</label>
                <input type="number" id="minutes_played" name="minutes_played" min="0" max="120" defaultValue={stat.minutes_played || 0} className={inputBaseClasses} />
              </div>
              <div>
                <label htmlFor="position_played" className={labelClasses}>Poste occupé</label>
                <select id="position_played" name="position_played" defaultValue={stat.position_played || ""} className={inputBaseClasses}>
                  <option value="">Sélectionner...</option>
                  <option value="BU">BU (Buteur)</option>
                  <option value="AG">AG (Ailier Gauche)</option>
                  <option value="AD">AD (Ailier Droit)</option>
                  <option value="MOC">MOC (Milieu Offensif)</option>
                  <option value="MC">MC (Milieu Central)</option>
                  <option value="MDC">MDC (Milieu Défensif)</option>
                  <option value="DG">DG (Défenseur Gauche)</option>
                  <option value="DD">DD (Défenseur Droit)</option>
                  <option value="DC">DC (Défenseur Central)</option>
                  <option value="GB">GB (Gardien)</option>
                </select>
              </div>

              <div>
                <label htmlFor="goals" className={labelClasses}>Buts inscrits</label>
                <input type="number" id="goals" name="goals" min="0" defaultValue={stat.goals || 0} className={inputBaseClasses} />
              </div>
              <div>
                <label htmlFor="assists" className={labelClasses}>Passes décisives</label>
                <input type="number" id="assists" name="assists" min="0" defaultValue={stat.assists || 0} className={inputBaseClasses} />
              </div>
            </div>

            <div className="flex items-center gap-3 bg-amber-50 p-4 rounded-xl border border-amber-100 mt-4">
              <input type="checkbox" id="is_motm" name="is_motm" value="true" defaultChecked={stat.is_motm} className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
              <label htmlFor="is_motm" className="font-bold text-amber-900">Élu Homme du Match (MOTM) 🏆</label>
            </div>
          </div>
        </div>

        {/* BLOC 3 : DISCIPLINE */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center gap-2">
            <span>⚖️</span> Discipline
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="yellow_cards" className={labelClasses}>Cartons Jaunes 🟨</label>
              <input type="number" id="yellow_cards" name="yellow_cards" min="0" max="2" defaultValue={stat.yellow_cards || 0} className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="red_cards" className={labelClasses}>Cartons Rouges 🟥</label>
              <input type="number" id="red_cards" name="red_cards" min="0" max="1" defaultValue={stat.red_cards || 0} className={inputBaseClasses} />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end sticky bottom-6 z-10">
          <SubmitButton 
            defaultLabel="Mettre à jour le match" 
            loadingLabel="Mise à jour..." 
            className="w-full md:w-auto px-8 py-4 text-lg rounded-2xl shadow-xl shadow-indigo-200"
          />
        </div>

      </form>
    </div>
  )
}