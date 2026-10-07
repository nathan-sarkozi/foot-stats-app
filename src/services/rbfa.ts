const RBFA_GRAPHQL_ENDPOINT = 'https://datalake-prod2018.rbfa.be/graphql'

// Fonction utilitaire interne ultra-sécurisée
async function fetchFromRBFA(body: unknown) {
  try {
    const response = await fetch(RBFA_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Anti-Bot Spoofing : On simule un navigateur légitime
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.rbfa.be',
        'Referer': 'https://www.rbfa.be/',
      },
      next: { revalidate: 10800 }, // Cache de 3 heures pour économiser les requêtes
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
    // Mise à jour avec tes données exactes
    operationName: "getSeriesAndRankingsQuery", 
    variables: { teamId, language: "fr" },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "ace90f0250b37a504282e27289c62ea6a3f444ef8821f663bd1faa8e3689e358" 
      }
    }
  })

  // Le chemin d'accès au tableau de classement correspond au JSON que tu m'as envoyé
  return result?.data?.teamSeriesAndRankings?.rankings?.[0]?.rankings?.[0] || null
}