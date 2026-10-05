'use client'

import { useState, useRef } from 'react'
import { saveCareerEntry } from '../actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import clubsData from '@/data/belgian_clubs.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CareerForm({ initialData = null }: { initialData?: any }) {
  const [isFreeAgent, setIsFreeAgent] = useState(initialData?.is_free_agent || false)
  const [hasStats, setHasStats] = useState(initialData ? initialData.has_stats : true)
  const formRef = useRef<HTMLFormElement>(null)

  const inputBaseClasses = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm transition-all disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
  const labelClasses = "block text-sm font-bold text-slate-700"

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const maxYear = currentMonth >= 6 ? currentYear : currentYear - 1
  const years = Array.from({length: 30}, (_, i) => maxYear - i)

  const handleAction = async (formData: FormData) => {
    await saveCareerEntry(formData)
    if (!initialData) {
      formRef.current?.reset()
      setIsFreeAgent(false)
      setHasStats(true)
    }
  }

  return (
    <form ref={formRef} action={handleAction} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
      {initialData && <input type="hidden" name="entry_id" value={initialData.id} />}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label htmlFor="season_start" className={labelClasses}>Saison *</label>
          <select id="season_start" name="season_start" required defaultValue={initialData?.season_start || maxYear - 1} className={inputBaseClasses}>
            {years.map(y => <option key={y} value={y}>{y} - {y + 1}</option>)}
          </select>
        </div>

        <div className="md:col-span-2 flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <input type="checkbox" id="is_free_agent" name="is_free_agent" checked={isFreeAgent} onChange={(e) => setIsFreeAgent(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="is_free_agent" className="font-bold text-slate-700">J&apos;étais sans club cette saison-là</label>
        </div>

        <div>
          <label htmlFor="club" className={labelClasses}>Club</label>
          <input type="text" id="club" name="club" list="belgian-clubs" placeholder="Ex: FC Enghiennois" disabled={isFreeAgent} required={!isFreeAgent} defaultValue={initialData?.club || ''} className={inputBaseClasses} />
          <datalist id="belgian-clubs">{clubsData.map((club) => <option key={club.matricule} value={club.nom}>Mat. {club.matricule}</option>)}</datalist>
        </div>

        <div>
          <label htmlFor="category" className={labelClasses}>Catégorie (Optionnel)</label>
          <input type="text" id="category" name="category" placeholder="Ex: Réserve C, P3, U19..." disabled={isFreeAgent} defaultValue={initialData?.category || ''} className={inputBaseClasses} />
        </div>

        <div className="md:col-span-2 flex items-center gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
          <input type="checkbox" id="is_youth" name="is_youth" defaultChecked={initialData?.is_youth} className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
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
            <input type="number" id="matches_played" name="matches_played" min="0" defaultValue={initialData?.matches_played || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="goals" className={labelClasses}>Buts ⚽</label>
            <input type="number" id="goals" name="goals" min="0" defaultValue={initialData?.goals || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="assists" className={labelClasses}>Passes 👟</label>
            <input type="number" id="assists" name="assists" min="0" defaultValue={initialData?.assists || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="yellow_cards" className={labelClasses}>Jaunes 🟨</label>
            <input type="number" id="yellow_cards" name="yellow_cards" min="0" defaultValue={initialData?.yellow_cards || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="red_cards" className={labelClasses}>Rouges 🟥</label>
            <input type="number" id="red_cards" name="red_cards" min="0" defaultValue={initialData?.red_cards || 0} disabled={!hasStats} className={inputBaseClasses} />
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <SubmitButton defaultLabel={initialData ? "Modifier la saison" : "Ajouter à ma carrière"} loadingLabel="Traitement..." />
      </div>
    </form>
  )
}