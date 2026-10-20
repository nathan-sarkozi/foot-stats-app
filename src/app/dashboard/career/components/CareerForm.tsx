'use client'

import { useState, useRef, useActionState } from 'react'
import { saveCareerEntry } from '../actions'
import { getCareerSeasonYears, type CareerEntry } from '../career-form'
import { EMPTY_FORM_STATE, type FormState } from '@/utils/formState'
import { FormFeedback } from '@/components/ActionForm'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import clubsData from '@/data/belgian_clubs.json'

export default function CareerForm({ initialData = null }: { initialData?: CareerEntry | null }) {
  const [isFreeAgent, setIsFreeAgent] = useState(initialData?.is_free_agent ?? false)
  const [hasStats, setHasStats] = useState(initialData ? initialData.has_stats ?? false : true)
  const formRef = useRef<HTMLFormElement>(null)
  const allowReset = useRef(false)

  const inputBaseClasses = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm transition-all disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
  const labelClasses = "block text-sm font-bold text-slate-700"

  const years = getCareerSeasonYears(initialData?.season_start)
  const maxYear = getCareerSeasonYears()[0]

  const [state, handleAction] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await saveCareerEntry(previousState, formData)
    if (result.status === 'success' && !initialData) {
      allowReset.current = true
      formRef.current?.reset()
      allowReset.current = false
      setIsFreeAgent(false)
      setHasStats(true)
    }
    return result
  }, EMPTY_FORM_STATE)

  return (
    <form ref={formRef} action={handleAction} onReset={event => {
      // React resets uncontrolled inputs when an action resolves, including
      // validation failures. Keep their values until a creation succeeds.
      if (!allowReset.current) event.preventDefault()
    }} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
      {initialData && <input type="hidden" name="entry_id" value={initialData.id} />}
      <FormFeedback state={state} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label htmlFor="season_start" className={labelClasses}>Saison *</label>
          <select id="season_start" name="season_start" required defaultValue={initialData?.season_start ?? maxYear - 1} className={inputBaseClasses}>
            {years.map(y => <option key={y} value={y}>{y} - {y + 1}</option>)}
          </select>
        </div>

        <div className="md:col-span-2 flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <input type="checkbox" id="is_free_agent" name="is_free_agent" checked={isFreeAgent} onChange={(e) => setIsFreeAgent(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="is_free_agent" className="font-bold text-slate-700">J&apos;étais sans club cette saison-là</label>
        </div>

        <div>
          <label htmlFor="club" className={labelClasses}>Club</label>
          <input type="text" id="club" name="club" list="belgian-clubs" placeholder="Ex: FC Enghiennois" disabled={isFreeAgent} required={!isFreeAgent} maxLength={100} defaultValue={initialData?.club || ''} className={inputBaseClasses} />
          <datalist id="belgian-clubs">{clubsData.map((club) => <option key={club.matricule} value={club.nom}>Mat. {club.matricule}</option>)}</datalist>
        </div>

        <div>
          <label htmlFor="category" className={labelClasses}>Catégorie (Optionnel)</label>
          <input type="text" id="category" name="category" placeholder="Ex: Réserve C, P3, U19..." disabled={isFreeAgent} maxLength={50} defaultValue={initialData?.category || ''} className={inputBaseClasses} />
        </div>

        <div className="md:col-span-2 flex items-center gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
          <input type="checkbox" id="is_youth" name="is_youth" defaultChecked={initialData?.is_youth ?? false} className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="is_youth" className="font-bold text-indigo-900">C&apos;était en catégorie Jeune (Football d&apos;âge)</label>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Statistiques</h3>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="has_stats" name="has_stats" checked={hasStats} onChange={(e) => setHasStats(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <label htmlFor="has_stats" className="text-sm font-bold text-slate-600">Je connais mes statistiques</label>
          </div>
        </div>

        <div className={`grid grid-cols-2 md:grid-cols-5 gap-4 transition-opacity ${!hasStats ? 'opacity-40 pointer-events-none' : ''}`}>
          <div>
            <label htmlFor="matches_played" className={labelClasses}>Matchs</label>
            <input type="number" id="matches_played" name="matches_played" min="0" max="100" step="1" required={hasStats} defaultValue={initialData?.matches_played || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="goals" className={labelClasses}>Buts ⚽</label>
            <input type="number" id="goals" name="goals" min="0" max="200" step="1" required={hasStats} defaultValue={initialData?.goals || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="assists" className={labelClasses}>Passes décisives 👟</label>
            <input type="number" id="assists" name="assists" min="0" max="200" step="1" required={hasStats} defaultValue={initialData?.assists || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="yellow_cards" className={labelClasses}>Jaunes 🟨</label>
            <input type="number" id="yellow_cards" name="yellow_cards" min="0" max="50" step="1" required={hasStats} defaultValue={initialData?.yellow_cards || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="red_cards" className={labelClasses}>Rouges 🟥</label>
            <input type="number" id="red_cards" name="red_cards" min="0" max="20" step="1" required={hasStats} defaultValue={initialData?.red_cards || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <SubmitButton defaultLabel={initialData ? "Modifier la saison" : "Ajouter à ma carrière"} loadingLabel="Traitement..." />
      </div>
    </form>
  )
}
