import { unstable_cache } from 'next/cache'

const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

// 1. La fonction réseau pure (ne gère pas le cache Next.js directement)
async function fetchFromRBFARaw(body: unknown) {
  try {
    const scraperApiKey = process.env.SCRAPER_API_KEY
    let urlToFetch = RBFA_GRAPHQL_ENDPOINT

    if (scraperApiKey) {
      urlToFetch = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(RBFA_GRAPHQL_ENDPOINT)}&keep_headers=true&premium=true&country_code=eu&timeout=20000`
    }

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
      cache: 'no-store', // On désactive le cache fetch, c'est unstable_cache qui prend le relais au-dessus
      body: JSON.stringify(body)
    })

    if (!response.ok) return null
    
    const rawText = await response.text()
    if (rawText.trim().startsWith('<')) return null

    return JSON.parse(rawText)
  } catch (error) {
    console.error('Erreur réseau RBFA:', error)
    return null
  }
}

// 2. Récupération du prochain match (Mis en cache persistant par ID d'équipe)
export async function getUpcomingMatch(teamId: string) {
  if (!teamId) return null

  return unstable_cache(
    async () => {
      const result = await fetchFromRBFARaw({
        operationName: "GetUpcomingMatch",
        variables: { teamId, language: "fr" },
        extensions: {
          persistedQuery: { version: 1, sha256Hash: "7e0aa25b6dbe45cede5f1a16320b091be9078a7b9d8cb9cb1402fc35292696fb" }
        }
      })
      return result?.data?.upcomingMatch || null
    },
    [`rbfa-upcoming-${teamId}`], // Clé de stockage
    { tags: ['rbfa-data', `rbfa-team-${teamId}`] } // Invalidation via ton cron
  )()
}

// 3. Récupération du classement (Mis en cache persistant par ID d'équipe)
export async function getTeamRankings(teamId: string) {
  if (!teamId) return null

  return unstable_cache(
    async () => {
      const result = await fetchFromRBFARaw({
        operationName: "getSeriesAndRankingsQuery", 
        variables: { teamId, language: "fr" },
        extensions: {
          persistedQuery: { version: 1, sha256Hash: "ace90f0250b37a504282e27289c62ea6a3f444ef8821f663bd1faa8e3689e358" }
        }
      })
      return result?.data?.teamSeriesAndRankings?.rankings?.[0]?.rankings?.[0] || null
    },
    [`rbfa-rankings-${teamId}`], // Clé de stockage
    { tags: ['rbfa-data', `rbfa-team-${teamId}`] } // Invalidation via ton cron
  )()
}