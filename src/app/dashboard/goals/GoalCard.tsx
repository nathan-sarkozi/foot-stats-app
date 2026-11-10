import { GOAL_LABELS, type GoalMetric, type SeasonGoal, type buildGoalProgression } from '@/utils/seasonGoals'
import GoalForm from './GoalForm'
import DeleteGoalButton from './DeleteGoalButton'
import s from './goals.module.css'

type Progression = ReturnType<typeof buildGoalProgression>
const number = (value: number) => new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 }).format(value)

export default function GoalCard({ goal, metric, progress, index }: { goal: SeasonGoal, metric: GoalMetric, progress: Progression, index: number }) {
  const { label, unit } = GOAL_LABELS[metric]
  const completed = progress.status === 'achieved' || progress.status === 'exceeded'
  const partial = progress.kind === 'minimum'
  const unknown = progress.kind === 'unknown' || progress.kind === 'empty'
  const state = unknown ? 'À RENSEIGNER' : completed ? (partial ? 'CIBLE CONFIRMÉE' : progress.status === 'exceeded' ? 'DÉPASSÉ' : 'ATTEINT') : partial ? 'DONNÉES PARTIELLES' : 'EN CHEMIN'
  // A rounded-up percentage must not overstate a confirmed lower bound.
  const percentage = partial && progress.percentage !== null ? Math.floor(progress.percentage * 10) / 10 : progress.percentage
  const valueText = unknown ? `Progression ${progress.kind === 'empty' ? 'non calculable sans match saisi' : 'indéterminée'}. Cible : ${goal.target} ${unit}.` : `${partial ? 'Au moins ' : ''}${progress.value} ${unit} pour une cible de ${goal.target}. ${partial ? 'Au moins ' : ''}${number(percentage!)} pour cent.`
  return <article className={`${s.card} ${completed ? s.completed : ''} ${unknown ? s.unknown : ''}`} data-goal={goal.metric} data-goal-id={goal.id} data-progress-kind={progress.kind} aria-labelledby={`goal-${goal.id}`}>
    <div className={s.cardTop}><span className={s.eyebrow}>OBJECTIF {String(index + 1).padStart(2, '0')}</span><span className={s.cardState}>{completed && <span aria-hidden="true">✓ </span>}{state}</span></div>
    <h2 id={`goal-${goal.id}`}>{label}</h2>
    <p className={s.value}>{partial && <span className={s.atLeast}>Au moins</span>}<strong data-goal-value="">{progress.value === null ? '—' : number(progress.value)}</strong><span className={s.target}>/ {number(goal.target)}</span></p>
    <div className={s.progressHeading}><span>{unknown ? 'Progression indéterminée' : partial ? 'Minimum confirmé' : 'Progression'}</span><strong data-goal-percentage="">{unknown ? '—' : `${partial ? '≥ ' : ''}${number(percentage!)} %`}</strong></div>
    <div className={`${s.track} ${unknown ? s.trackUnknown : ''}`} role="progressbar" aria-label={`Objectif : ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={unknown ? undefined : progress.barPercentage} aria-valuetext={valueText}><span style={{ width: `${unknown ? 0 : progress.barPercentage}%` }} /></div>
    <p className={s.cardExplanation}>{progress.kind === 'empty' ? 'Aucun match saisi pour calculer la progression.' : progress.kind === 'unknown' ? 'Statistiques manquantes : total inconnu, pas zéro.' : partial ? (completed ? 'Objectif atteint sur les données confirmées. Le total reste incomplet et peut être plus élevé.' : 'Total incomplet : la cible peut déjà être atteinte.') : progress.status === 'exceeded' ? 'Cible dépassée. Barre plafonnée à 100 %.' : progress.status === 'achieved' ? 'Cible atteinte pour cette saison.' : `${number(progress.remaining!)} encore pour atteindre la cible.`}</p>
    <div className={s.cardActions}><details className={s.edit}><summary>Modifier la cible <span aria-hidden="true">↗</span></summary><GoalForm goal={goal} seasonStart={goal.season_start} metrics={[]} /></details><DeleteGoalButton goalId={goal.id} label={label} /></div>
  </article>
}
