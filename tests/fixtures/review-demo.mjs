// Invented season-review fixtures. Only the disposable local preview imports this file.
import { createRecordDemoData } from './record-demo.mjs'

export function createReviewDemoData(year, scenario = 'full', now = new Date()) {
  const data = createRecordDemoData(year, scenario)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now)
  const part = type => Number(parts.find(value => value.type === type).value)
  const today = Date.UTC(part('year'), part('month') - 1, part('day'))
  const seasonStart = Date.UTC(year, 6, 1)
  if (today < seasonStart) throw new RangeError('The fictitious season must already have started')
  const current = data.matches.filter(match => match.match_date >= `${year}-07-01` && match.match_date < `${year + 1}-07-01`)
  // Spread recorded fixtures over the elapsed season, never into the future.
  // The cap keeps the same demonstration readable later in the season as well.
  const days = Math.min(85, Math.floor((today - seasonStart) / 86400000))
  for (const [index, match] of current.entries()) {
    const elapsed = current.length < 2 ? 0 : Math.floor(index * days / (current.length - 1))
    match.match_date = new Date(seasonStart + elapsed * 86400000).toISOString().slice(0, 10)
  }
  if (scenario === 'full') {
    // Equal performances inside this season, not merely ties across two seasons.
    for (const [index, assists] of [[9, 2], [10, 3]]) {
      data.statistics.find(stat => stat.match_id.endsWith(String(index).padStart(12, '0'))).assists = assists
    }
  }
  return data
}
