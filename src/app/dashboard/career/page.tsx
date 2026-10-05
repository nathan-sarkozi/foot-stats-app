'use client'

import { useState, useRef } from 'react'
import { addCareerEntry } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import clubsData from '@/data/belgian_clubs.json'
import Link from 'next/link'

export default function ManageCareerPage() {
  const [isFreeAgent, setIsFreeAgent] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const inputBaseClasses = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm transition-all disabled:bg-slate-100 disabled:text-slate-400"
  const labelClasses = "block text-sm font-bold text-slate-700"

  const currentYear = new Date().getFullYear()

  const handleAction = async (formData: FormData) => {
    await addCareerEntry(formData)
    formRef.current?.reset()
    setIsFreeAgent(false)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 pt-6 px-4 sm:px-6 lg:px-8">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Historique de Carrière</h2>
          <p className="text-slate-500 mt-2 text-sm">Ajoute tes anciennes saisons pour compléter ton profil public.</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">
          Retour au Dashboard
        </Link>
      </div>

      <form ref={formRef} action={handleAction} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 md:col-span-2">
            <div className="flex-1">
              <label htmlFor="season_start" className={labelClasses}>Saison (Début) *</label>
              <input type="number" id="season_start" name="season_start" min="1990" max={currentYear} required defaultValue={currentYear - 1} className={inputBaseClasses} />
            </div>
            <span className="text-2xl font-bold text-slate-300 mt-6">-</span>
            <div className="flex-1">
              <label htmlFor="season_end" className={labelClasses}>Saison (Fin) *</label>
              <input type="number" id="season_end" name="season_end" min="1991" max={currentYear + 1} required defaultValue={currentYear} className={inputBaseClasses} />
            </div>
          </div>

          <div className="md:col-span-2 flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <input 
              type="checkbox" 
              id="is_free_agent" 
              name="is_free_agent" 
              value="true" 
              checked={isFreeAgent}
              onChange={(e) => setIsFreeAgent(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
            />
            <label htmlFor="is_free_agent" className="font-bold text-slate-700">J&apos;étais sans club cette saison-là</label>
          </div>

          <div>
            <label htmlFor="club" className={labelClasses}>Club</label>
            <input 
              type="text" 
              id="club" 
              name="club" 
              list="belgian-clubs"
              placeholder="Ex: FC Enghiennois" 
              disabled={isFreeAgent}
              required={!isFreeAgent}
              className={inputBaseClasses} 
            />
            <datalist id="belgian-clubs">
              {clubsData.map((club) => (
                <option key={club.matricule} value={club.nom}>
                  Mat. {club.matricule}
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="category" className={labelClasses}>Catégorie (Optionnel)</label>
            <input type="text" id="category" name="category" placeholder="Ex: Réserve C, P3, U19..." disabled={isFreeAgent} className={inputBaseClasses} />
          </div>

          <div className="md:col-span-2 flex items-center gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
            <input type="checkbox" id="is_youth" name="is_youth" value="true" className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <label htmlFor="is_youth" className="font-bold text-indigo-900">C&apos;était en catégorie Jeune (Football d&apos;âge)</label>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Statistiques (Optionnel)</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label htmlFor="matches_played" className={labelClasses}>Matchs</label>
              <input type="number" id="matches_played" name="matches_played" min="0" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="goals" className={labelClasses}>Buts ⚽</label>
              <input type="number" id="goals" name="goals" min="0" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="assists" className={labelClasses}>Passes 👟</label>
              <input type="number" id="assists" name="assists" min="0" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="yellow_cards" className={labelClasses}>Jaunes 🟨</label>
              <input type="number" id="yellow_cards" name="yellow_cards" min="0" defaultValue="0" className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="red_cards" className={labelClasses}>Rouges 🟥</label>
              <input type="number" id="red_cards" name="red_cards" min="0" defaultValue="0" className={inputBaseClasses} />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <SubmitButton defaultLabel="Ajouter à ma carrière" loadingLabel="Ajout en cours..." />
        </div>
      </form>

      {/* RAPPEL : Pour que la page soit parfaite, tu devras afficher ici la liste des saisons 
          déjà encodées avec un bouton pour les supprimer via server action deleteCareerEntry. */}
    </div>
  )
}