const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

async function fetchFromRBFA(body: unknown) {
  try {
    const scraperApiKey = process.env.SCRAPER_API_KEY
    let urlToFetch = RBFA_GRAPHQL_ENDPOINT

    if (!scraperApiKey) {
      console.error('🚨 ERREUR CRITIQUE : SCRAPER_API_KEY est introuvable sur ce serveur Vercel.')
    } else {
      // J'ai monté le timeout à 15s (15000)
      urlToFetch = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(RBFA_GRAPHQL_ENDPOINT)}&keep_headers=true&timeout=15000`
    }

    console.log(`📡 Tentative de fetch vers : ${scraperApiKey ? 'ScraperAPI' : 'RBFA Direct'}`)

    const response = await fetch(urlToFetch, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // ⚠️ TEMPORAIRE : On désactive complètement le cache pour purger l'historique d'échecs
      cache: 'no-store',
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.error(`❌ ÉCHEC HTTP : Statut ${response.status} - ${response.statusText}`)
      const errorText = await response.text()
      console.error(`🔍 Détail de l'erreur : ${errorText.substring(0, 150)}`)
      return null
    }
    
    const rawText = await response.text()
    
    if (rawText.trim().startsWith('<')) {
      console.error('🧱 BLOCAGE WAF : Réponse HTML reçue au lieu de JSON.')
      console.error(`🔍 Extrait HTML : ${rawText.substring(0, 150)}`)
      return null
    }

    console.log('✅ Fetch RBFA réussi.')
    return JSON.parse(rawText)
  } catch (error) {
    console.error('💥 ERREUR RÉSEAU GLOBALE Fetch RBFA:', error)
    return null
  }
}

export async function getUpcomingMatch(teamId: string) {
  if (!teamId) return null
  const result = await fetchFromRBFA({
    operationName: "GetUpcomingMatch",
    variables: { teamId, language: "fr" },
    extensions: {
      persistedQuery: { version: 1, sha256Hash: "7e0aa25b6dbe45cede5f1a16320b091be9078a7b9d8cb9cb1402fc35292696fb" }
    }
  })
  return result?.data?.upcomingMatch || null
}

export async function getTeamRankings(teamId: string) {
  if (!teamId) return null
  const result = await fetchFromRBFA({
    operationName: "getSeriesAndRankingsQuery", 
    variables: { teamId, language: "fr" },
    extensions: {
      persistedQuery: { version: 1, sha256Hash: "ace90f0250b37a504282e27289c62ea6a3f444ef8821f663bd1faa8e3689e358" }
    }
  })
  return result?.data?.teamSeriesAndRankings?.rankings?.[0]?.rankings?.[0] || null
}