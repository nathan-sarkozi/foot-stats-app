import { createClient } from '@/utils/supabase/server'
import CareerForm from '../../components/CareerForm'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { careerEntryIdSchema } from '../../career-form'
import s from '../../../personal.module.css'

export default async function EditCareerPage(props: { params: Promise<{ id: string }> }) {
  const resolvedParams = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const entryId = careerEntryIdSchema.safeParse(resolvedParams.id)
  if (!entryId.success) notFound()

  const { data: entry, error } = await supabase
    .from('career_entries')
    .select('*')
    .eq('id', entryId.data)
    .eq('player_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Carrière : chargement de la saison', { code: error.code, message: error.message })
    throw new Error('Impossible de charger cette saison de carrière.')
  }
  if (!entry) notFound()

  return <div className={`${s.page} ${s.editCareer}`}>
    <Link href="/dashboard/career" className={s.back}><span aria-hidden="true">←</span> Annuler et retourner à ma carrière</Link>
    <header className={s.hero}><div><span className={s.eyebrow}>UN CHAPITRE DE TON PARCOURS</span><h1>Modifier la saison<span>.</span></h1><p>Saison {entry.season_start}–{entry.season_end} · Met à jour les informations de cette période.</p></div></header>
    <CareerForm initialData={entry} />
  </div>
}
