const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

async function fetchFromRBFA(body: unknown) {
  try {
    const scraperApiKey = process.env.SCRAPER_API_KEY
    let urlToFetch = RBFA_GRAPHQL_ENDPOINT

    if (!scraperApiKey) {
      console.error("🚨 API KEY MANQUANTE : process.env.SCRAPER_API_KEY n'est pas défini !");
    } else {
      // J'ai retiré keep_headers=true pour laisser ScraperAPI gérer l'anonymat à 100%
      urlToFetch = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(RBFA_GRAPHQL_ENDPOINT)}&timeout=15000&premium=true`
    }

    console.log("📡 FETCH RBFA via:", scraperApiKey ? "ScraperAPI (Premium)" : "Direct");

    const response = await fetch(urlToFetch, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // ⚠️ DÉSACTIVATION COMPLÈTE DU CACHE LE TEMPS DU DEBUG ⚠️
      cache: 'no-store', 
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.error(`❌ ÉCHEC HTTP : ${response.status} - ${response.statusText}`)
      const errorText = await response.text()
      console.error(`🔍 Body d'erreur : ${errorText}`)
      return null
    }
    
    const rawText = await response.text()
    
    if (rawText.trim().startsWith('<')) {
      console.error('🧱 BLOCAGE HTML REÇU (Le Proxy a échoué)')
      console.error(`🔍 Extrait : ${rawText.substring(0, 200)}`)
      return null
    }

    console.log('✅ Fetch RBFA réussi ! (Données JSON reçues)')
    return JSON.parse(rawText)
  } catch (error) {
    console.error('💥 ERREUR RÉSEAU / EXCEPTION:', error)
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