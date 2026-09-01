import { addMatch } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import Link from 'next/link'

export default function AddMatchPage() {
  const inputBaseClasses = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm transition-all"
  const labelClasses = "block text-sm font-bold text-slate-700"

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12 pt-6">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Ajouter un match</h2>
          <p className="text-slate-500 mt-2 text-sm">Enregistre ta dernière performance sur le terrain.</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">
          Annuler
        </Link>
      </div>

      <form action={addMatch} className="space-y-6">
        
        {/* BLOC 1 : LE MATCH */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center gap-2">
            <span>⚽</span> Informations du match
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="match_date" className={labelClasses}>Date du match *</label>
              <input type="date" id="match_date" name="match_date" required className={inputBaseClasses} />
            </div>
            
            <div>
              <label htmlFor="opponent" className={labelClasses}>Adversaire *</label>
              <input type="text" id="opponent" name="opponent" placeholder="Ex: FC Écaussinnes" required className={inputBaseClasses} />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="competition_type" className={labelClasses}>Compétition *</label>
              <select id="competition_type" name="competition_type" required className={inputBaseClasses}>
                <option value="LEAGUE">Championnat</option>
                <option value="CUP">Coupe</option>
                <option value="FRIENDLY">Amical</option>
              </select>
            </div>

            <div className="flex items-center gap-4 md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex-1">
                <label htmlFor="team_score" className={labelClasses}>Buts marqués (Équipe)</label>
                <input type="number" id="team_score" name="team_score" min="0" required defaultValue="0" className={inputBaseClasses} />
              </div>
              <span className="text-2xl font-bold text-slate-300 mt-6">-</span>
              <div className="flex-1">
                <label htmlFor="opponent_score" className={labelClasses}>Buts encaissés</label>
                <input type="number" id="opponent_score" name="opponent_score" min="0" required defaultValue="0" className={inputBaseClasses} />
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
              <input type="checkbox" id="has_played" name="has_played" value="true" defaultChecked className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="has_played" className="font-bold text-indigo-900">J&apos;ai participé à ce match</label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="minutes_played" className={labelClasses}>Minutes jouées</label>
                <input type="number" id="minutes_played" name="minutes_played" min="0" max="120" defaultValue="90" className={inputBaseClasses} />
              </div>
              <div>
                <label htmlFor="position_played" className={labelClasses}>Poste occupé</label>
                <select id="position_played" name="position_played" className={inputBaseClasses}>
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
                <input type="number" id="goals" name="goals" min="0" defaultValue="0" className={inputBaseClasses} />
              </div>
              <div>
                <label htmlFor="assists" className={labelClasses}>Passes décisives</label>
                <input type="number" id="assists" name="assists" min="0" defaultValue="0" className={inputBaseClasses} />
              </div>
            </div>

            <div className="flex items-center gap-3 bg-amber-50 p-4 rounded-xl border border-amber-100 mt-4">
              <input type="checkbox" id="is_motm" name="is_motm" value="true" className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
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
              <input type="number" id="yellow_cards" name="yellow_cards" min="0" max="2" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="red_cards" className={labelClasses}>Cartons Rouges 🟥</label>
              <input type="number" id="red_cards" name="red_cards" min="0" max="1" defaultValue="0" className={inputBaseClasses} />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end sticky bottom-6 z-10">
          <SubmitButton 
            defaultLabel="Enregistrer le match" 
            loadingLabel="Enregistrement..." 
            className="w-full md:w-auto px-8 py-4 text-lg rounded-2xl shadow-xl shadow-indigo-200"
          />
        </div>

      </form>
    </div>
  )
}