import { createClient } from '@/utils/supabase/server'
import { updateProfile, updateAvatar } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import Image from 'next/image'
import clubsData from '@/data/belgian_clubs.json'
import ActionForm from '@/components/ActionForm'
import AvatarInput from '@/components/AvatarInput'
import { AVATAR_SIZE_LABEL } from '@/utils/avatar'
import Link from 'next/link'
import ui from '@/components/stadium.module.css'
import s from '../personal.module.css'

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
    return <div className={s.page}><p role="alert" className={`${ui.feedback} ${ui.feedbackError}`}>Erreur lors du chargement du profil.</p></div>
  }

  const userProfile = profile
  const inputBaseClasses = ui.field

  return <div className={s.page}>
    <Link href="/dashboard" className={s.back}><span aria-hidden="true">←</span> Retour au dashboard</Link>
    <header className={s.hero}><div><span className={s.eyebrow}>TON IDENTITÉ, SUR LE TERRAIN ET AU-DELÀ</span><h1>Paramètres du profil<span>.</span></h1><p>Gère tes informations publiques et athlétiques. Un profil qui ressemble au joueur que tu es.</p></div></header>
    {searchParams?.success && <div role="status" className={`${ui.feedback} ${ui.feedbackSuccess}`}>{searchParams.success === 'avatar' ? 'Ta photo de profil a été mise à jour avec succès.' : 'Tes informations ont été enregistrées avec succès.'}</div>}
    <div className={s.settingsLayout}>
      <aside className={s.avatarAside}>
        <ActionForm action={updateAvatar} variant="stade" className={s.avatarForm}>
          <div className={s.sectionHeading}><span>01</span><div><h2>La photo du joueur</h2><p>Le visage de ton parcours.</p></div></div>
          <div className={s.profileAvatar}>{userProfile.avatar_url ? <Image src={userProfile.avatar_url} alt="Avatar" fill className={s.avatarImage} sizes="112px" /> : userProfile.display_name.substring(0, 2).toUpperCase()}</div>
          <strong className={s.avatarName}>{userProfile.display_name}</strong>
          <label htmlFor="avatar" className={ui.label}>Photo de profil (Max {AVATAR_SIZE_LABEL})</label>
          <AvatarInput id="avatar" required variant="stade" className={s.avatarInput} />
          <p className={s.hint}>JPEG, PNG ou WebP · Maximum {AVATAR_SIZE_LABEL}.</p>
          <SubmitButton defaultLabel="Changer la photo" loadingLabel="Upload..." appearance="stade" />
        </ActionForm>
        <p className={s.avatarNote}>Ces informations accompagnent tes statistiques et ton profil public. Aucune photo ? Tes initiales prennent le relais.</p>
      </aside>
      <ActionForm action={updateProfile} variant="stade" className={s.profileForm}>
        <section className={s.formSection} aria-labelledby="identity-title">
          <div className={s.sectionHeading}><span>02</span><div><h2 id="identity-title">Identité & Club</h2><p>Les couleurs et le nom qui te représentent.</p></div></div>
          <div className={s.twoColumns}>
            <div className={s.fullWidth}><label htmlFor="display_name" className={ui.label}>Pseudo / Nom affiché *</label><input type="text" name="display_name" id="display_name" required defaultValue={userProfile.display_name} className={inputBaseClasses} /></div>
            <div><label htmlFor="club" className={ui.label}>Club actuel</label><input type="text" name="club" id="club" list="belgian-clubs" placeholder="Ex: FC Enghiennois" defaultValue={userProfile.club || ''} className={inputBaseClasses} /><datalist id="belgian-clubs">{clubsData.map(club => <option key={club.matricule} value={club.nom}>Mat. {club.matricule}</option>)}</datalist></div>
            <div><label htmlFor="category" className={ui.label}>Catégorie / Division</label><input type="text" name="category" id="category" placeholder="Ex: Réserve C" defaultValue={userProfile.category || ''} className={inputBaseClasses} /></div>
          </div>
        </section>
        <section className={s.rbfaSection} aria-labelledby="rbfa-title"><div className={s.rbfaHeading}><span>RBFA</span><h2 id="rbfa-title">Le lien avec ton équipe</h2></div><label htmlFor="rbfa_team_id" className={ui.label}>Connexion RBFA (Widget Dashboard)</label><input type="text" name="rbfa_team_id" id="rbfa_team_id" placeholder="Ex: 368465 ou colle l’URL de ton équipe" defaultValue={userProfile.rbfa_team_id || ''} className={inputBaseClasses} /><p className={s.hint}>Va sur la page de ton équipe sur le site officiel de la RBFA. Colle l’URL complète ici ou saisis uniquement le numéro situé après <code>/team/</code>.</p></section>
        <section className={s.formSection} aria-labelledby="athletic-title">
          <div className={s.sectionHeading}><span>03</span><div><h2 id="athletic-title">Profil Athlétique</h2><p>Ta place et tes repères sur le terrain.</p></div></div>
          <div className={s.twoColumns}>
            <div><label htmlFor="preferred_position" className={ui.label}>Poste de prédilection</label><select id="preferred_position" name="preferred_position" defaultValue={userProfile.preferred_position || ''} className={inputBaseClasses}><option value="">Sélectionner...</option><option value="BU">BU (Buteur)</option><option value="AG">AG (Ailier Gauche)</option><option value="AD">AD (Ailier Droit)</option><option value="MOC">MOC (Milieu Offensif)</option><option value="MC">MC (Milieu Central)</option><option value="MDC">MDC (Milieu Défensif)</option><option value="DG">DG (Défenseur Gauche)</option><option value="DD">DD (Défenseur Droit)</option><option value="DC">DC (Défenseur Central)</option><option value="GB">GB (Gardien)</option></select></div>
            <div><label htmlFor="foot_preference" className={ui.label}>Pied fort</label><select id="foot_preference" name="foot_preference" defaultValue={userProfile.foot_preference || ''} className={inputBaseClasses}><option value="">Sélectionner...</option><option value="Droitier">Droitier</option><option value="Gaucher">Gaucher</option><option value="Ambidextre">Ambidextre</option></select></div>
            <div className={`${s.physicalFields} ${s.fullWidth}`}><div><label htmlFor="jersey_number" className={ui.label}>N° Maillot</label><input type="number" name="jersey_number" id="jersey_number" min="1" max="99" defaultValue={userProfile.jersey_number || ''} className={inputBaseClasses} /></div><div><label htmlFor="height" className={ui.label}>Taille (cm)</label><input type="number" name="height" id="height" min="100" max="250" defaultValue={userProfile.height || ''} className={inputBaseClasses} /></div><div><label htmlFor="weight" className={ui.label}>Poids (kg)</label><input type="number" name="weight" id="weight" min="30" max="150" defaultValue={userProfile.weight || ''} className={inputBaseClasses} /></div></div>
          </div>
        </section>
        <div className={s.formActions}><SubmitButton defaultLabel="Enregistrer les modifications" loadingLabel="Mise à jour..." appearance="stade" /></div>
      </ActionForm>
    </div>
  </div>
}
