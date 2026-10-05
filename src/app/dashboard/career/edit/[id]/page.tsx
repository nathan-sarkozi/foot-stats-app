import { createClient } from '@/utils/supabase/server'
import CareerForm from '../../components/CareerForm'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'

export default async function EditCareerPage(props: { params: Promise<{ id: string }> }) {
  const resolvedParams = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: entry, error } = await supabase
    .from('career_entries')
    .select('*')
    .eq('id', resolvedParams.id)
    .eq('player_id', user.id)
    .single()

  if (error || !entry) return notFound()

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 pt-6 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Modifier la saison</h2>
          <p className="text-slate-500 mt-2 text-sm">Met à jour les informations de cette période.</p>
        </div>
        <Link href="/dashboard/career" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors shrink-0">
          Annuler et retourner
        </Link>
      </div>

      <CareerForm initialData={entry} />
    </div>
  )
}