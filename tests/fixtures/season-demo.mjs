// Invented local-only records. Never imported by the application.
export const DEMO_PLAYER_ID = '10000000-0000-4000-8000-000000000001'

export function createSeasonDemoData(year) {
  const matches = [], statistics = []
  const add = (date, competition, index, previous = false) => {
    const id = `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    const bench = index === 5
    matches.push({ id, player_id: DEMO_PLAYER_ID, match_date: date, opponent: ['Racing des Rives', 'Union du Parc', 'Étoile du Canal', 'Athlétique des Prés'][index % 4] + ' (fictif)', competition_type: competition, team_score: [2, 0, 1, 3][index % 4], opponent_score: [1, 2, 1, 0][index % 4] })
    statistics.push({ id, match_id: id, player_id: DEMO_PLAYER_ID, has_played: !bench, minutes_played: bench ? 0 : previous ? 45 + (index % 4) * 10 : [90, 75, 60, 30][index % 4], goals: bench ? 0 : index % (previous ? 5 : 3) === 0 ? 1 : 0, assists: bench ? 0 : index % (previous ? 4 : 3) === 1 ? 1 : 0, yellow_cards: bench ? 2 : index % 5 === 0 ? 1 : 0, red_cards: bench ? 1 : 0, is_motm: !bench && index % 6 === 0, position_played: bench ? null : index % 3 === 0 ? 'MOC' : 'MC' })
  }
  for (let i = 0; i < 18; i++) add(`${year}-${String(7 + Math.floor(i / 5)).padStart(2, '0')}-${String(1 + (i % 5) * 5).padStart(2, '0')}`, ['LEAGUE', 'CUP', 'FRIENDLY'][i % 3], i + 1)
  for (let i = 0; i < 8; i++) add(`${year - 1}-${i < 4 ? '09' : '10'}-${String(2 + (i % 4) * 6).padStart(2, '0')}`, i % 2 ? 'FRIENDLY' : 'LEAGUE', i + 101, true)
  add(`${year}-06-30`, 'LEAGUE', 110, true)
  const entry = (start, values) => ({ id: `30000000-0000-4000-8000-${String(start).padStart(12, '0')}`, player_id: DEMO_PLAYER_ID, season_start: start, season_end: start + 1, club: 'Sporting des Étoiles (fictif)', category: 'P3', is_youth: false, is_free_agent: false, is_verified: false, has_stats: false, matches_played: null, goals: null, assists: null, yellow_cards: null, red_cards: null, ...values })
  return {
    profiles: [{ id: DEMO_PLAYER_ID, display_name: 'Alex Terrain · Joueur fictif', club: 'Sporting des Étoiles (fictif)', category: 'P3', jersey_number: 8, preferred_position: 'MC', rbfa_team_id: '123456', avatar_url: null, foot_preference: 'Droitier', height: 180, weight: 74 }],
    matches, statistics,
    career_entries: [
      entry(year - 2, { has_stats: true, matches_played: 28, goals: 6, assists: 9, yellow_cards: 3, red_cards: 0 }),
      entry(year - 3, { club: 'Union des Premiers Terrains (fictif)', matches_played: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 }),
      entry(year - 4, { club: null, category: null, is_free_agent: true }),
      entry(1985, { club: 'Académie du Parc (fictive)', category: 'U17', is_youth: true }),
    ],
    rbfa_cache: [{ team_id: '123456', updated_at: new Date().toISOString(), upcoming_match: { homeTeam: { name: 'Sporting des Étoiles (fictif)', logo: null }, awayTeam: { name: 'Racing des Rives (fictif)', logo: null }, series: { name: 'Série de démonstration' }, startTime: `${year + 1}-03-28T15:00:00` }, rankings: { teams: Array.from({ length: 8 }, (_, i) => ({ teamId: i === 1 ? '123456' : String(200000 + i), name: i === 1 ? 'Sporting des Étoiles (fictif)' : `Équipe fictive ${i + 1}`, logo: null, position: i + 1, points: 30 - i * 3, matchesPlayed: 14, goalDifference: 15 - i * 4 })) } }],
  }
}
