import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { updateMatch } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import DeleteButton from './DeleteButton'
import Link from 'next/link'
import MatchFields from '@/app/dashboard/components/MatchFields'
import s from '../../match-editor.module.css'
import ui from '@/components/stadium.module.css'
import { matchIdSchema } from '../../match-form'
import ActionForm from '@/components/ActionForm'
import { checkReadError } from '@/utils/readErrors'

interface EditMatchProps {
  params: Promise<{
    id: string
  }>
}

export default async function EditMatchPage(props: EditMatchProps) {
  const resolvedParams = await props.params
  const matchId = resolvedParams.id

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  if (!matchIdSchema.safeParse(matchId).success) {
    return notFound()
  }

  const [matchResponse, statisticsResponse] = await Promise.all([
    supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .eq('player_id', user.id)
      .maybeSingle(),
    supabase
      .from('statistics')
      .select('*')
      .eq('match_id', matchId)
      .eq('player_id', user.id)
      .maybeSingle(),
  ])
  const { data: match, error: matchError } = matchResponse
  const { data: stat, error: statisticsError } = statisticsResponse

  checkReadError(matchError, 'Edit match read failed')
  if (!match) {
    return notFound()
  }

  const heading = <>
    <Link href="/dashboard" className={s.back}><span aria-hidden="true">←</span> Retour au dashboard</Link>
    <header className={s.hero}>
      <div><span className={s.eyebrow}>FEUILLE DE MATCH / MODIFICATION</span><h1>Modifier le match<span>.</span></h1><p>Face à {match.opponent}. Retrouve les détails de la rencontre et ajuste ta performance.</p></div>
      <div className={s.heroMark} aria-hidden="true"><span>↗</span></div>
    </header>
  </>
  const deletion = <section className={s.deleteZone} aria-labelledby="delete-match-title">
    <div><h2 id="delete-match-title">Supprimer cette rencontre</h2><p>Le match et ses statistiques seront supprimés définitivement.<br />Une confirmation te sera demandée.</p></div>
    <DeleteButton matchId={matchId} />
  </section>

  if (statisticsError || !stat) {
    if (statisticsError) console.error('Edit match statistics read failed', { code: statisticsError.code, message: statisticsError.message })
    return <div className={s.page}>
      {heading}
      <div className={s.unavailable}>
        <p role="alert">{statisticsError
          ? 'Impossible de charger les statistiques de ce match. Réessaie avant de le modifier.'
          : 'Les statistiques de ce match sont absentes. La modification est indisponible.'}</p>
        <Link href="/dashboard" className={ui.textLink}>Retour au dashboard</Link>
      </div>
      {deletion}
    </div>
  }

  return <div className={s.page}>
    {heading}
    <ActionForm action={updateMatch} variant="stade" className={s.form}>
      <input type="hidden" name="match_id" value={matchId} />
      <MatchFields match={match} stat={stat} />
      <div className={s.actions}>
        <div><strong>Le même match. Le bon détail.</strong><p>Vérifie tes informations avant d’enregistrer.</p></div>
        <div className={s.actionButtons}><Link href="/dashboard" className={s.cancel}>Annuler</Link><SubmitButton defaultLabel="Mettre à jour le match" loadingLabel="Mise à jour..." appearance="stade" /></div>
      </div>
    </ActionForm>
    {deletion}
  </div>
}
