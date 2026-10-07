const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

// Fonction utilitaire interne ultra-sécurisée
async function fetchFromRBFA(body: unknown) {
  try {
    const response = await fetch(RBFA_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*', // Changé pour imiter un navigateur
        // Anti-Bot Spoofing Avancé : On imite Safari sur Mac OS
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Origin': 'https://www.rbfa.be',
        'Referer': 'https://www.rbfa.be/',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      },
      next: { revalidate: 10800 }, // Cache de 3 heures
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.error('RBFA API unavailable:', response.status)
      return null
    }
    
    // SÉCURITÉ : On lit d'abord la réponse en texte brut
    const rawText = await response.text()
    
    // Si la réponse commence par '<' (HTML, XML), c'est une erreur du pare-feu
    if (rawText.trim().startsWith('<')) {
      console.error('RBFA a renvoyé du HTML (bloqué par le pare-feu)')
      return null
    }

    // Si on arrive ici, c'est du vrai JSON, on le parse sereinement
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