import { createClient } from '@/utils/supabase/server'
import CareerForm from './components/CareerForm'
import { deleteCareerEntry } from './actions'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function ManageCareerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: entries } = await supabase
    .from('career_entries')
    .select('*')
    .eq('player_id', user.id)
    .order('season_end', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 pt-6 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Historique de Carrière</h2>
          <p className="text-slate-500 mt-2 text-sm">Ajoute et gère tes anciennes saisons sportives.</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors shrink-0">
          Retour au Dashboard
        </Link>
      </div>

      <CareerForm />

      {entries && entries.length > 0 && (
        <div className="mt-12">
          <h3 className="text-xl font-extrabold text-slate-900 mb-6">Saisons enregistrées</h3>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {entries.map(entry => (
              <div key={entry.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-700">{entry.season_start}-{entry.season_end}</span>
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${entry.is_youth ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                      {entry.is_youth ? 'Jeune' : 'Senior'}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 mt-1">{entry.is_free_agent ? <span className="italic text-slate-400">Sans club</span> : entry.club}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/dashboard/career/edit/${entry.id}`} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                    Éditer
                  </Link>
                  <form action={deleteCareerEntry}>
                    <input type="hidden" name="entry_id" value={entry.id} />
                    <button type="submit" className="text-sm font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors">
                      Supprimer
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}