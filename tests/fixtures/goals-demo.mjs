// Invented goals, only for the disposable local preview. Never imported by app code.
import { createReviewDemoData } from './review-demo.mjs'
import { DEMO_PLAYER_ID } from './season-demo.mjs'

export function createGoalsDemoData(year, scenario = 'full', now = new Date()) {
  const data = createReviewDemoData(year, scenario, now)
  if (scenario === 'short') {
    // Complete, genuine zeroes distinguish a known lack of progress from unknowns.
    for (const stat of data.statistics) Object.assign(stat, { goals: 0, assists: 0, is_motm: false })
  }
  const seasonStats = start => data.matches
    .filter(match => match.match_date >= `${start}-07-01` && match.match_date < `${start + 1}-07-01`)
    .map(match => data.statistics.find(stat => stat.match_id === match.id))
    .filter(stat => stat?.has_played === true)
  const current = seasonStats(year)
  const sum = metric => current.reduce((total, stat) => total + (Number.isInteger(stat[metric]) ? stat[metric] : 0), 0)
  let id = 1
  const goal = (season_start, metric, target) => ({
    id: `40000000-0000-4000-8000-${String(id++).padStart(12, '0')}`,
    player_id: DEMO_PLAYER_ID, season_start, metric, target,
    created_at: `${year}-07-01T12:00:00.000Z`,
  })
  const full = scenario === 'full'
  data.season_goals = [
    goal(year, 'goals', full ? Math.max(1, sum('goals')) : 15),
    goal(year, 'assists', full ? Math.max(1, sum('assists') - 2) : 10),
    goal(year, 'appearances', Math.max(25, current.length + 5)),
    goal(year, 'motm', 5),
    goal(year - 1, 'goals', 8),
    goal(year - 1, 'assists', 6),
    // Manual history alone must not invent match-based progress.
    goal(year - 3, 'goals', 10),
    // E2 already supplies a partially known recorded season here.
    goal(year - 5, 'goals', 5),
    goal(year - 5, 'motm', 2),
    // Private goal-only season: no match or career entry reveals it publicly.
    goal(year - 6, 'appearances', 20),
  ]
  return data
}
