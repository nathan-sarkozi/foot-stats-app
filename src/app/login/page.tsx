import { login } from './actions'
import Link from 'next/link'
import AuthFrame from '@/components/AuthFrame'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import ui from '@/components/stadium.module.css'
import s from './login.module.css'

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>
}) {
  const searchParams = await props.searchParams

  const getErrorMessage = (error: string) => {
    if (error === 'Missing credentials') return 'Identifiants manquants.'
    if (error === 'Could not authenticate user') return 'Échec de l\'authentification. Vérifie tes identifiants.'
    return error
  }

  return <AuthFrame mode="login">
    <div className={s.heading}><h2>Connexion</h2></div>
    <form action={login} className={s.form}>
      <div><label htmlFor="email" className={ui.label}>Adresse e-mail</label><input id="email" name="email" type="email" required className={ui.field} placeholder="tonadresse@exemple.be" autoComplete="email" /></div>
      <div><label htmlFor="password" className={ui.label}>Mot de passe</label><input id="password" name="password" type="password" required className={ui.field} placeholder="Ton mot de passe" autoComplete="current-password" /></div>
      {searchParams?.error && <p role="alert" className={`${ui.feedback} ${ui.feedbackError}`}>{getErrorMessage(searchParams.error)}</p>}
      <SubmitButton defaultLabel="Se connecter" loadingLabel="Connexion..." appearance="stade" className={s.submit} />
    </form>
    <p className={s.registerLink}>Nouveau joueur ? <Link href="/register" className={ui.textLink}>Créer un profil <span aria-hidden="true">↗</span></Link></p>
  </AuthFrame>
}
