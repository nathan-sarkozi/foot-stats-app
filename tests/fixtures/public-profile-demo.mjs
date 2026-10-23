// Synthetic identities only. Imported by tests and the disposable local preview.
export const PROFILE_DEMO_IDS = [1, 2, 3, 4].map(n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`)

export function createPublicProfileDemoData(year) {
  const profiles = PROFILE_DEMO_IDS.map((id, index) => ({
    id, display_name: ['Alex · Profil complet fictif', 'Noé · Sans players (fictif)', 'Sam · Sans match (fictif)', 'Lou · Stats inconnues (fictif)'][index],
    club: 'Club de démonstration (fictif)', category: 'P3', jersey_number: 8, preferred_position: 'MC',
    rbfa_team_id: null, avatar_url: null, foot_preference: 'Droitier', height: null, weight: null,
  }))
  const matches = [], statistics = []
  const add = (player, startYear, unknown = false) => {
    const id = `20000000-0000-4000-8000-${String(matches.length + 1).padStart(12, '0')}`
    matches.push({ id, player_id: player, match_date: `${startYear}-09-01`, opponent: `Adversaire fictif ${matches.length + 1}`, competition_type: 'LEAGUE', team_score: 2, opponent_score: 1 })
    statistics.push({ id, player_id: player, match_id: id, has_played: true, minutes_played: unknown ? null : 60, goals: unknown ? null : 2, assists: unknown ? null : 1, yellow_cards: 0, red_cards: 0, is_motm: unknown ? null : false, position_played: unknown ? null : 'MC' })
  }
  add(PROFILE_DEMO_IDS[0], year)
  add(PROFILE_DEMO_IDS[1], year)
  add(PROFILE_DEMO_IDS[1], year - 1)
  add(PROFILE_DEMO_IDS[3], year, true)
  return {
    // Model only the current SELECT policies: authenticated reads for profiles,
    // matches/statistics, public career reads. No real policy is changed.
    enforceProfileReadPolicies: true,
    profiles, matches, statistics,
    players: [{ id: PROFILE_DEMO_IDS[0], username: 'synthetic-complete-player' }],
    career_entries: [{ id: '30000000-0000-4000-8000-000000000001', player_id: PROFILE_DEMO_IDS[1], season_start: 1985, season_end: 1986, club: 'Club historique fictif', category: 'U17', is_youth: true, is_free_agent: false, is_verified: false, has_stats: true, matches_played: 10, goals: 22, assists: 4, yellow_cards: 0, red_cards: 0 }],
    rbfa_cache: [], season_goals: [],
  }
}
