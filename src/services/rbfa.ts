const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

async function fetchFromRBFA(body: unknown) {
  try {
    const scraperApiKey = process.env.SCRAPER_API_KEY
    let urlToFetch = RBFA_GRAPHQL_ENDPOINT

    if (scraperApiKey) {
      // Le hack ultime : premium=true force ScraperAPI à utiliser une vraie IP résidentielle
      urlToFetch = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(RBFA_GRAPHQL_ENDPOINT)}&keep_headers=true&timeout=15000&premium=true`
    }

    const response = await fetch(urlToFetch, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // ARCHITECTURE OPTIMISÉE : Cache infini, lié à un tag spécifique.
      cache: 'force-cache',
      next: { tags: ['rbfa-data'] }, 
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.error('RBFA API unavailable:', response.status)
      return null
    }
    
    const rawText = await response.text()
    
    if (rawText.trim().startsWith('<')) {
      console.error('RBFA a renvoyé du HTML (bloqué par le pare-feu)')
      return null
    }

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
      persistedQuery: {
        version: 1,
        sha256Hash: "7e0aa25b6dbe45cede5f1a16320b091be9078a7b9d8cb9cb1402fc35292696fb"
      }
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
      persistedQuery: {
        version: 1,
        sha256Hash: "ace90f0250b37a504282e27289c62ea6a3f444ef8821f663bd1faa8e3689e358" 
      }
    }
  })

  return result?.data?.teamSeriesAndRankings?.rankings?.[0]?.rankings?.[0] || null
}