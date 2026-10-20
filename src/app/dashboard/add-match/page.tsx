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
      <div><span className={s.eyebrow}>LE JEU SE RACONTE / NOUVELLE RENCONTRE</span><h1>Ajouter un match<span>.</span></h1><p>Le terrain a parlé. Garde une trace de ta performance et fais avancer le fil de ta saison.</p></div>
      <div className={s.heroMark} aria-hidden="true"><span>＋</span></div>
    </header>
    <ActionForm action={addMatch} variant="stade" className={s.form}>
      <MatchFields />
      <div className={s.actions}>
        <div><strong>Le match est terminé. L’histoire continue.</strong><p>Les champs marqués d’un * sont obligatoires.</p></div>
        <div className={s.actionButtons}><Link href="/dashboard" className={s.cancel}>Annuler</Link><SubmitButton defaultLabel="Enregistrer le match" loadingLabel="Enregistrement..." appearance="stade" /></div>
      </div>
    </ActionForm>
    <p className={s.footnote}>Une rencontre, tes contributions, ta progression. Les cartons sont conservés même sans participation.</p>
  </div>
}
