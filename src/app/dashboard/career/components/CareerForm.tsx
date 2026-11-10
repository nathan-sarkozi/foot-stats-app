'use client'

import { useState, useRef, useActionState, useEffect } from 'react'
import { saveCareerEntry } from '../actions'
import { getCareerSeasonYears, type CareerEntry } from '../career-form'
import { EMPTY_FORM_STATE, type FormState } from '@/utils/formState'
import { FormFeedback } from '@/components/ActionForm'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import clubsData from '@/data/belgian_clubs.json'
import ui from '@/components/stadium.module.css'
import s from '../../personal.module.css'

export default function CareerForm({ initialData = null }: { initialData?: CareerEntry | null }) {
  const [isFreeAgent, setIsFreeAgent] = useState(initialData?.is_free_agent ?? false)
  const [hasStats, setHasStats] = useState(initialData ? initialData.has_stats ?? false : true)
  const formRef = useRef<HTMLFormElement>(null)
  const allowReset = useRef(false)

  const inputBaseClasses = ui.field
  const labelClasses = ui.label

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

  useEffect(() => {
    if (state.status === 'error') formRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus()
  }, [state])

  return (
    <form ref={formRef} action={handleAction} onReset={event => {
      // React resets uncontrolled inputs when an action resolves, including
      // validation failures. Keep their values until a creation succeeds.
      if (!allowReset.current) event.preventDefault()
    }} className={s.careerForm}>
      {initialData && <input type="hidden" name="entry_id" value={initialData.id} />}
      <FormFeedback state={state} variant="stade" />
      <div className={s.sectionHeading}><span>01</span><div><h2>{initialData ? "La saison renseignée" : "Ajouter une saison"}</h2></div></div>
      
      <div className={s.twoColumns}>
        <div className={s.fullWidth}>
          <label htmlFor="season_start" className={labelClasses}>Saison *</label>
          <select id="season_start" name="season_start" required defaultValue={initialData?.season_start ?? maxYear - 1} className={inputBaseClasses}>
            {years.map(y => <option key={y} value={y}>{y} - {y + 1}</option>)}
          </select>
        </div>

        <div className={`${s.toggle} ${s.fullWidth}`}>
          <input type="checkbox" id="is_free_agent" name="is_free_agent" checked={isFreeAgent} onChange={(e) => setIsFreeAgent(e.target.checked)} className={s.checkbox} />
          <label htmlFor="is_free_agent" className={s.toggleLabel}>J&apos;étais sans club cette saison-là</label>
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

        <div className={`${s.toggle} ${s.fullWidth}`}>
          <input type="checkbox" id="is_youth" name="is_youth" defaultChecked={initialData?.is_youth ?? false} className={s.checkbox} />
          <label htmlFor="is_youth" className={s.toggleLabel}>C&apos;était en catégorie Jeune (Football d&apos;âge)</label>
        </div>
      </div>

      <div className={s.careerStats}>
        <div className={s.statsHeading}>
          <h3 className={s.formTitle}>Statistiques</h3>
          <div className={s.statsToggle}>
            <input type="checkbox" id="has_stats" name="has_stats" checked={hasStats} onChange={(e) => setHasStats(e.target.checked)} className={s.checkbox} />
            <label htmlFor="has_stats" className={s.toggleLabel}>Je connais mes statistiques</label>
          </div>
        </div>

        <div className={s.careerStatsFields} data-disabled={!hasStats || undefined}>
          <div>
            <label htmlFor="matches_played" className={labelClasses}>Matchs</label>
            <input type="number" id="matches_played" name="matches_played" min="0" max="100" step="1" required={hasStats} defaultValue={initialData ? (initialData.has_stats ? initialData.matches_played ?? '' : '') : 0} placeholder="—" disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="goals" className={labelClasses}>Buts ⚽</label>
            <input type="number" id="goals" name="goals" min="0" max="200" step="1" required={hasStats} defaultValue={initialData ? (initialData.has_stats ? initialData.goals ?? '' : '') : 0} placeholder="—" disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="assists" className={labelClasses}>Passes décisives 👟</label>
            <input type="number" id="assists" name="assists" min="0" max="200" step="1" required={hasStats} defaultValue={initialData ? (initialData.has_stats ? initialData.assists ?? '' : '') : 0} placeholder="—" disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="yellow_cards" className={labelClasses}>Jaunes 🟨</label>
            <input type="number" id="yellow_cards" name="yellow_cards" min="0" max="50" step="1" required={hasStats} defaultValue={initialData ? (initialData.has_stats ? initialData.yellow_cards ?? '' : '') : 0} placeholder="—" disabled={!hasStats} className={inputBaseClasses} />
          </div>
          <div>
            <label htmlFor="red_cards" className={labelClasses}>Rouges 🟥</label>
            <input type="number" id="red_cards" name="red_cards" min="0" max="20" step="1" required={hasStats} defaultValue={initialData ? (initialData.has_stats ? initialData.red_cards ?? '' : '') : 0} placeholder="—" disabled={!hasStats} className={inputBaseClasses} />
          </div>
        </div>
      </div>

      <p className={s.hint}>Statistiques inconnues ? Décoche « Je connais mes statistiques ».</p>
      <div className={s.formActions}>
        <SubmitButton defaultLabel={initialData ? "Modifier la saison" : "Ajouter à ma carrière"} loadingLabel="Traitement..." appearance="stade" />
      </div>
    </form>
  )
}
