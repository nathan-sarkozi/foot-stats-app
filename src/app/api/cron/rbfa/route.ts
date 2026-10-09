import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js' // Ici on utilise le client admin

const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

// Fonction interne pour taper ScraperAPI
async function fetchScraperAPI(scraperApiKey: string, operationName: string, hash: string, teamId: string) {
  const urlToFetch = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(RBFA_GRAPHQL_ENDPOINT)}&keep_headers=true&premium=true&country_code=eu&timeout=20000`
  
  const response = await fetch(urlToFetch, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Origin': 'https://www.rbfa.be',
      'Referer': 'https://www.rbfa.be/',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    cache: 'no-store',
    body: JSON.stringify({
      operationName,
      variables: { teamId, language: "fr" },
      extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
    })
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`ScraperAPI HTTP Error [${response.status}]:`, errorBody)
    throw new Error(`ScraperAPI a retourné un statut ${response.status}: ${errorBody.slice(0, 100)}`)
  }

  const json = await response.json()
  return json.data
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  
  // Sécurité du Cron
  if (authHeader !== `Bearer ${process.env.CRON_SECRET_2}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // ⚠️ On utilise le client Supabase avec la SERVICE_ROLE_KEY pour contourner le RLS en insertion
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const scraperApiKey = process.env.SCRAPER_API_KEY
    if (!scraperApiKey) throw new Error('Clé ScraperAPI manquante')

    // Liste de tes équipes à rafraîchir (Ajoute les IDs de tes 2 équipes ici)
    const teamsToUpdate = ['368465', '368464'] 

    for (const teamId of teamsToUpdate) {
      // 1. Fetch réseau payant
      const upcomingData = await fetchScraperAPI(scraperApiKey, "GetUpcomingMatch", "7e0aa25b6dbe45cede5f1a16320b091be9078a7b9d8cb9cb1402fc35292696fb", teamId)
      const rankingsData = await fetchScraperAPI(scraperApiKey, "getSeriesAndRankingsQuery", "ace90f0250b37a504282e27289c62ea6a3f444ef8821f663bd1faa8e3689e358", teamId)

      const upcomingMatch = upcomingData?.upcomingMatch || null
      const rankings = rankingsData?.teamSeriesAndRankings?.rankings?.[0]?.rankings?.[0] || null

      // 2. Upsert (Insertion ou Mise à jour) dans Supabase
      await supabaseAdmin.from('rbfa_cache').upsert({
        team_id: teamId,
        upcoming_match: upcomingMatch,
        rankings: rankings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'team_id' })
    }

    return NextResponse.json({ success: true, message: 'Base de données RBFA synchronisée avec succès.' })

  } catch (error) {
    console.error('Erreur Cron:', error)
    return NextResponse.json({ success: false, message: 'Erreur lors de la synchro' }, { status: 500 })
  }
}