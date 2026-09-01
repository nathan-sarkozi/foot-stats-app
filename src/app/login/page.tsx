import { login } from './actions' // <-- Fais attention au nom de ton fichier d'action (actions.ts ou action.ts selon ce que tu as)
import Link from 'next/link'

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>
}) {
  const searchParams = await props.searchParams

  const getErrorMessage = (error: string) => {
    if (error === 'Missing credentials') return 'Identifiants manquants.'
    if (error === 'Could not authenticate user') return 'Échec de l\'authentification. Vérifie tes identifiants.'
    return error
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-8 rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-slate-900">Connexion</h2>
          <p className="mt-2 text-sm text-slate-500">Accède à tes statistiques de football</p>
        </div>

        <form className="mt-8 space-y-6" action={login}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-slate-700 mb-1">Adresse e-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="relative block w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                placeholder="Ex: nathan@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-1">Mot de passe</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {searchParams?.error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg font-medium border border-red-100">
              {getErrorMessage(searchParams.error)}
            </p>
          )}

          <button
            type="submit"
            className="group relative flex w-full justify-center rounded-xl border border-transparent bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all"
          >
            Se connecter
          </button>
        </form>

        {/* LE LIEN MANQUANT EST ICI */}
        <p className="text-center mt-6 text-sm text-slate-500 font-medium">
          Nouveau joueur ? <Link href="/register" className="text-indigo-600 hover:underline font-bold">Créer un profil</Link>
        </p>
      </div>
    </div>
  )
}