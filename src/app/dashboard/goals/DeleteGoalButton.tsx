import ActionForm from '@/components/ActionForm'
import SubmitButton from '../components/SubmitButton'
import { deleteSeasonGoal } from './actions'
import s from './goals.module.css'

export default function DeleteGoalButton({ goalId, label }: { goalId: string, label: string }) {
  return <details className={s.delete}>
    <summary>Supprimer<span className={s.srOnly}> l’objectif {label}</span></summary>
    <div className={s.deleteConfirm}><p>Supprimer cet objectif ? Tes matchs et statistiques seront conservés.</p><ActionForm action={deleteSeasonGoal} variant="stade"><input type="hidden" name="goal_id" value={goalId} /><SubmitButton defaultLabel="Confirmer la suppression" loadingLabel="Suppression…" variant="danger" appearance="stade" /></ActionForm></div>
  </details>
}
