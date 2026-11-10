import { addMatch } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import MatchFields from '@/app/dashboard/components/MatchFields'
import Link from 'next/link'
import ActionForm from '@/components/ActionForm'
import s from '../match-editor.module.css'

export default function AddMatchPage() {
  return <div className={s.page}>
    <Link href="/dashboard" className={s.back}><span aria-hidden="true">←</span> Retour au dashboard</Link>
    <header className={s.hero}>
      <div><h1>Ajouter un match<span>.</span></h1></div>
      <div className={s.heroMark} aria-hidden="true"><span>＋</span></div>
    </header>
    <ActionForm action={addMatch} variant="stade" className={s.form}>
      <MatchFields />
      <div className={s.actions}>
        <div><p>Les champs marqués d’un * sont obligatoires.</p></div>
        <div className={s.actionButtons}><Link href="/dashboard" className={s.cancel}>Annuler</Link><SubmitButton defaultLabel="Enregistrer le match" loadingLabel="Enregistrement..." appearance="stade" /></div>
      </div>
    </ActionForm>

  </div>
}
