import { createClient } from '@/utils/supabase/server'
import { updateProfile } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'

interface UserProfile {
  display_name: string
  club: string | null
  category: string | null
  preferred_position: string | null
  foot_preference: string | null
  jersey_number: number | null
  height: number | null
  weight: number | null
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch complete profile data
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, club, category, preferred_position, foot_preference, jersey_number, height, weight')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return <div className="text-red-500">Erreur lors du chargement du profil.</div>
  }

  const userProfile = profile as UserProfile
  const inputBaseClasses = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-12 pt-6">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Paramètres du profil</h2>
        <p className="text-slate-500 mt-2 text-sm">Gère tes informations publiques et athlétiques.</p>
      </div>

      <form action={updateProfile} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 space-y-8">
        
        {/* SECTION IDENTITÉ */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Identité & Club</h3>
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="display_name" className="block text-sm font-bold text-slate-700">Pseudo / Nom affiché *</label>
              <input type="text" name="display_name" id="display_name" required defaultValue={userProfile.display_name} className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="club" className="block text-sm font-bold text-slate-700">Club actuel</label>
              <input type="text" name="club" id="club" placeholder="Ex: FC Dev" defaultValue={userProfile.club || ""} className={inputBaseClasses} />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-bold text-slate-700">Catégorie / Division</label>
              <input type="text" name="category" id="category" placeholder="Ex: Réserve C" defaultValue={userProfile.category || ""} className={inputBaseClasses} />
            </div>
          </div>
        </div>

        {/* SECTION ATHLÉTIQUE */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Profil Athlétique</h3>
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div>
              <label htmlFor="preferred_position" className="block text-sm font-bold text-slate-700">Poste de prédilection</label>
              <select id="preferred_position" name="preferred_position" defaultValue={userProfile.preferred_position || ""} className={inputBaseClasses}>
                <option value="">Sélectionner...</option>
                <option value="BU">BU (Buteur)</option>
                <option value="AG">AG (Ailier Gauche)</option>
                <option value="AD">AD (Ailier Droit)</option>
                <option value="MOC">MOC (Milieu Offensif)</option>
                <option value="MC">MC (Milieu Central)</option>
                <option value="MDC">MDC (Milieu Défensif)</option>
                <option value="DG">DG (Défenseur Gauche)</option>
                <option value="DD">DD (Défenseur Droit)</option>
                <option value="DC">DC (Défenseur Central)</option>
                <option value="GB">GB (Gardien)</option>
              </select>
            </div>
            <div>
              <label htmlFor="foot_preference" className="block text-sm font-bold text-slate-700">Pied fort</label>
              <select id="foot_preference" name="foot_preference" defaultValue={userProfile.foot_preference || ""} className={inputBaseClasses}>
                <option value="">Sélectionner...</option>
                <option value="Droitier">Droitier</option>
                <option value="Gaucher">Gaucher</option>
                <option value="Ambidextre">Ambidextre</option>
              </select>
            </div>
            <div className="flex space-x-4 sm:col-span-2">
              <div className="w-1/3">
                <label htmlFor="jersey_number" className="block text-sm font-bold text-slate-700">N° Maillot</label>
                <input type="number" name="jersey_number" id="jersey_number" min="1" max="99" defaultValue={userProfile.jersey_number || ""} className={inputBaseClasses} />
              </div>
              <div className="w-1/3">
                <label htmlFor="height" className="block text-sm font-bold text-slate-700">Taille (cm)</label>
                <input type="number" name="height" id="height" min="100" max="250" defaultValue={userProfile.height || ""} className={inputBaseClasses} />
              </div>
              <div className="w-1/3">
                <label htmlFor="weight" className="block text-sm font-bold text-slate-700">Poids (kg)</label>
                <input type="number" name="weight" id="weight" min="30" max="150" defaultValue={userProfile.weight || ""} className={inputBaseClasses} />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 flex justify-end">
          <SubmitButton 
            defaultLabel="Enregistrer les modifications" 
            loadingLabel="Mise à jour..." 
          />
        </div>
      </form>
    </div>
  )
}