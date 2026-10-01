import clubsData from '@/data/belgian_clubs.json'

/**
 * Recherche le logo d'un club à partir de son nom exact (O(N) search)
 * @param clubName Le nom du club enregistré en base de données
 * @returns L'URL du logo ou null si non trouvé
 */
export function getClubLogo(clubName: string | null): string | null {
  if (!clubName) return null
  
  // Recherche insensible à la casse
  const club = clubsData.find(c => c.nom.toLowerCase() === clubName.toLowerCase())
  
  return club?.logo || null
}