'use client'

export default function ErrorPage({ unstable_retry }: { unstable_retry: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8" role="alert">
      <h2 className="text-xl font-bold text-slate-900">Impossible de charger cette page</h2>
      <p className="text-slate-600">Une erreur est survenue. Réessaie dans quelques instants.</p>
      <button onClick={() => unstable_retry()} className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white">
        Réessayer
      </button>
    </div>
  )
}
