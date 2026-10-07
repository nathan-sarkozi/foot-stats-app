const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

async function fetchFromRBFA(body: unknown) {
  try {
    const scraperApiKey = process.env.SCRAPER_API_KEY

    // Si pas de clé (ou si on est en local et qu'on l'a oubliée), on tape en direct
    let urlToFetch = RBFA_GRAPHQL_ENDPOINT
    
    // Si la clé est dispo (en Prod), on construit l'URL du proxy
    if (scraperApiKey) {
      urlToFetch = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(RBFA_GRAPHQL_ENDPOINT)}&keep_headers=true&timeout=8000`
    }

    const response = await fetch(urlToFetch, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      next: { revalidate: 10800 }, // Cache vital pour ne pas exploser le quota gratuit
      body: JSON.stringify(body)
    })

    if (!response.ok) return null
    
    const rawText = await response.text()
    if (rawText.trim().startsWith('<')) return null

    return JSON.parse(rawText)
  } catch (error) {
    console.error('Erreur globale Fetch RBFA:', error)
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