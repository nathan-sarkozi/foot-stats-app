import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  
  // Utilisation de ta variable personnalisée
  if (authHeader !== `Bearer ${process.env.CRON_SECRET_2}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // @ts-expect-error: Contournement du bug de typage interne Next.js (attend un 2e argument fantôme)
    revalidateTag('rbfa-data')
    
    return NextResponse.json({ revalidated: true, message: 'Cache RBFA purgé avec succès', timestamp: Date.now() })
  } catch {
    // Suppression du "(error)" pour satisfaire la règle ESLint "no-unused-vars"
    return NextResponse.json({ revalidated: false, message: 'Erreur lors de la purge' }, { status: 500 })
  }
}