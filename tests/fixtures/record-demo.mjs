// Invented records only; reused by the local preview, never imported by app code.
import { createSeasonDemoData, DEMO_PLAYER_ID } from './season-demo.mjs'

export function createRecordDemoData(year, scenario = 'full') {
  const data = createSeasonDemoData(year)
  const change = (index, goals, assists) => {
    const stat = data.statistics.find(row => row.match_id.endsWith(String(index).padStart(12, '0')))
    Object.assign(stat, { goals, assists })
  }
  for (const [index, goals, assists] of [[1, 3, 2], [2, 1, 3], [3, 1, 1], [4, 1, 0], [6, 1, 1], [7, 0, 1], [8, 0, 0], [9, 3, 0], [106, 2, 3]]) change(index, goals, assists)
  for (let index = 1; index <= 3; index++) {
    const id = `20000000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`
    data.matches.push({ id, player_id: DEMO_PLAYER_ID, match_date: `${year - 5}-09-${String(index * 7).padStart(2, '0')}`, opponent: `Souvenir de terrain ${index} (fictif)`, competition_type: 'FRIENDLY', team_score: null, opponent_score: null })
    data.statistics.push({ id, match_id: id, player_id: DEMO_PLAYER_ID, has_played: true, minutes_played: index === 2 ? null : 60, goals: index === 2 ? null : 1, assists: index === 2 ? null : 0, is_motm: null, position_played: null, yellow_cards: null, red_cards: null })
  }
  if (scenario === 'empty') { data.matches = []; data.statistics = [] }
  if (scenario === 'short' || scenario === 'unknown') {
    data.matches = data.matches.slice(0, scenario === 'short' ? 2 : 3)
    data.statistics = data.statistics.filter(row => data.matches.some(match => match.id === row.match_id))
    if (scenario === 'short') for (const [i, stat] of data.statistics.entries()) Object.assign(stat, { goals: i, assists: i, is_motm: false })
    else {
      data.statistics = data.statistics.slice(0, 2)
      for (const [i, stat] of data.statistics.entries()) Object.assign(stat, { has_played: i === 0 ? true : null, goals: null, assists: null, minutes_played: null, is_motm: null })
    }
  }
  return data
}
