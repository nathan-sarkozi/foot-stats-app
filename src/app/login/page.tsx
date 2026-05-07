import { login } from './actions'

// Next.js 15 requires searchParams to be a Promise
export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>
}) {
  // Unwrap the promise
  const searchParams = await props.searchParams

  const getErrorMessage = (error: string) => {
    if (error === 'Missing credentials') return 'Identifiants manquants.'
    if (error === 'Could not authenticate user') return 'Échec de l\'authentification. Vérifie tes identifiants.'
    return error
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-md">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">Connexion</h2>
          <p className="mt-2 text-sm text-gray-600">Accède à tes statistiques de football</p>
        </div>

        <form className="mt-8 space-y-6" action={login}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="sr-only">Adresse e-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="relative block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                placeholder="Adresse e-mail"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Mot de passe</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                placeholder="Mot de passe"
              />
            </div>
          </div>

          {searchParams?.error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {getErrorMessage(searchParams.error)}
            </p>
          )}

          <button
            type="submit"
            className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  )
}