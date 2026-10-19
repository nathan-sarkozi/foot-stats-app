import { createClient } from '@/utils/supabase/server'
import { updateProfile, updateAvatar } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import Image from 'next/image'
import clubsData from '@/data/belgian_clubs.json'
import ActionForm from '@/components/ActionForm'
import AvatarInput from '@/components/AvatarInput'
import { AVATAR_SIZE_LABEL } from '@/utils/avatar'

export default async function SettingsPage(props: { searchParams: Promise<{ success?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile, error } = await supabase
    .from('profiles')
    // Ajout de rbfa_team_id dans le select
    .select('display_name, avatar_url, club, category, preferred_position, foot_preference, jersey_number, height, weight, rbfa_team_id') 
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return <div className="text-red-500">Erreur lors du chargement du profil.</div>
  }

  const userProfile = profile
  const inputBaseClasses = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-12 pt-6">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Paramètres du profil</h2>
        <p className="text-slate-500 mt-2 text-sm">Gère tes informations publiques et athlétiques.</p>
      </div>

      {searchParams?.success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {searchParams.success === 'avatar' 
            ? "Ta photo de profil a été mise à jour avec succès." 
            : "Tes informations ont été enregistrées avec succès."}
        </div>
      )}

      <ActionForm action={updateAvatar} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row items-center gap-6">
        <div className="h-24 w-24 shrink-0 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-extrabold text-4xl border border-indigo-100 overflow-hidden relative">
          {userProfile.avatar_url ? (
            <Image src={userProfile.avatar_url} alt="Avatar" fill className="object-cover" sizes="96px" />
          ) : (
            userProfile.display_name.substring(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1 space-y-3 w-full">
          <label htmlFor="avatar" className="block text-sm font-bold text-slate-700">Photo de profil (Max {AVATAR_SIZE_LABEL})</label>
          <AvatarInput
            id="avatar" 
            required 
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer"
          />
          <SubmitButton defaultLabel="Changer la photo" loadingLabel="Upload..." />
        </div>
      </ActionForm>

      <ActionForm action={updateProfile} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 space-y-8">
        <div>
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Identité & Club</h3>
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="display_name" className="block text-sm font-bold text-slate-700">Pseudo / Nom affiché *</label>
              <input type="text" name="display_name" id="display_name" required defaultValue={userProfile.display_name} className={inputBaseClasses} />
            </div>
            
            <div>
              <label htmlFor="club" className="block text-sm font-bold text-slate-700">Club actuel</label>
              <input 
                type="text" 
                name="club" 
                id="club" 
                list="belgian-clubs"
                placeholder="Ex: FC Enghiennois" 
                defaultValue={userProfile.club || ""} 
                className={inputBaseClasses} 
              />
              <datalist id="belgian-clubs">
                {clubsData.map((club) => (
                  <option key={club.matricule} value={club.nom}>
                    Mat. {club.matricule}
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-bold text-slate-700">Catégorie / Division</label>
              <input type="text" name="category" id="category" placeholder="Ex: Réserve C" defaultValue={userProfile.category || ""} className={inputBaseClasses} />
            </div>

            {/* NOUVEAU CHAMP RBFA */}
            <div className="sm:col-span-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
              <label htmlFor="rbfa_team_id" className="block text-sm font-bold text-indigo-900">Connexion RBFA (Widget Dashboard)</label>
              <input 
                type="text" 
                name="rbfa_team_id" 
                id="rbfa_team_id" 
                placeholder="Ex: 368465 ou colle l'URL de ton équipe" 
                defaultValue={userProfile.rbfa_team_id || ""} 
                className={`mt-2 ${inputBaseClasses}`} 
              />
              <p className="text-xs text-indigo-700/80 mt-2 font-medium">
                Va sur la page de ton équipe sur le site officiel de la RBFA. Colle l&apos;URL complète ici ou saisis uniquement le numéro situé après <code className="bg-white/60 px-1 py-0.5 rounded text-indigo-900 font-bold">/team/</code>.
              </p>
            </div>
          </div>
        </div>

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
          <SubmitButton defaultLabel="Enregistrer les modifications" loadingLabel="Mise à jour..." />
        </div>
      </ActionForm>
    </div>
  )
}
