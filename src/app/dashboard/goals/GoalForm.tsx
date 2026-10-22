import ActionForm from '@/components/ActionForm'
import SubmitButton from '../components/SubmitButton'
import { GOAL_LABELS, type GoalMetric, type SeasonGoal } from '@/utils/seasonGoals'
import { createSeasonGoal, updateSeasonGoal } from './actions'
import { MAX_GOAL_TARGET } from './goal-form'
import s from './goals.module.css'

export default function GoalForm({ seasonStart, metrics, goal }: { seasonStart: number, metrics: readonly GoalMetric[], goal?: SeasonGoal }) {
  return <ActionForm action={goal ? updateSeasonGoal : createSeasonGoal} variant="stade" className={s.form}>
    {goal ? <input type="hidden" name="goal_id" value={goal.id} /> : <input type="hidden" name="season_start" value={seasonStart} />}
    {!goal && <label className={s.label}>Ton repère<select name="metric" defaultValue={metrics[0]} required className={s.field}>{metrics.map(metric => <option key={metric} value={metric}>{GOAL_LABELS[metric].label}</option>)}</select></label>}
    <label className={s.label}>{goal ? 'Nouvelle cible' : 'Ta cible de saison'}<input type="number" name="target" required min="1" max={MAX_GOAL_TARGET} step="1" inputMode="numeric" defaultValue={goal?.target ?? ''} placeholder="Ex. 15" className={s.field} aria-describedby={goal ? `target-help-${goal.id}` : 'create-goal-help'} /></label>
    <p id={goal ? `target-help-${goal.id}` : 'create-goal-help'} className={s.small}>{goal ? 'Changer la cible conserve tous tes matchs et leurs statistiques.' : 'Un nombre entier positif. Tu pourras ajuster cette cible à tout moment.'}</p>
    <SubmitButton defaultLabel={goal ? 'Enregistrer la cible' : 'Définir mon objectif'} loadingLabel="Enregistrement…" appearance="stade" className={s.submit} />
  </ActionForm>
}
