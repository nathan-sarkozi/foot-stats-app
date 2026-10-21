import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'
import { renderServerPage } from './helpers/render-server-page.mjs'

const captured = {}
const recharts = Object.fromEntries(['CartesianGrid', 'Line', 'LineChart', 'ResponsiveContainer', 'Tooltip', 'XAxis', 'YAxis'].map(name => [name, props => {
  captured[name] = props
  return React.createElement('div', null, props.children)
}]))
const Journey = loadUiModule('src/app/dashboard/season-review/SeasonJourney.tsx', { recharts }).default
const point = (id, participation, contributions) => ({ id, date: '2026-10-01', opponent: `Fixture ${id}`, participation, goals: contributions, assists: contributions === null ? null : 0, contributions, cumGoals: null, cumAssists: 0 })

test('per-match journey keeps chronological points, explicit zero and unknown gaps without chart animation', () => {
  const points = [point('first', true, 0), point('unknown', true, null), point('bench', false, null), point('later', true, 2)]
  const html = renderToStaticMarkup(React.createElement(Journey, { points }))
  assert.match(html, /Contributions décisives par rencontre, dans l’ordre des dates/)
  assert.deepEqual(captured.LineChart.data.map(row => row.contributions), [0, null, null, 2])
  assert.deepEqual(captured.LineChart.data.map(row => row.id), points.map(row => row.id))
  assert.equal(captured.LineChart.accessibilityLayer, true)
  assert.equal(captured.Line.connectNulls, false)
  assert.equal(captured.Line.isAnimationActive, false)
  assert.equal(captured.Line.dataKey, 'contributions')
  assert.equal(captured.Line.type, 'linear')
  assert.equal(captured.YAxis.allowDecimals, false)
})

test('unknown-only, empty and bench-only journeys explain the missing curve instead of inventing zeros', () => {
  for (const points of [[], [point('unknown', true, null)], [point('bench', false, null)]]) {
    const html = renderToStaticMarkup(React.createElement(Journey, { points }))
    assert.match(html, /pas assez renseignées pour tracer une courbe fiable/)
    assert.doesNotMatch(html, /role="group"/)
  }
})

test('dashboard access preserves selected season and competition without adding a primary navigation item', async () => {
  const statistics = [{ has_played: true, minutes_played: 60, goals: 0, assists: 1, yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC', matches: { id: 'fixture', match_date: '2025-10-01', opponent: 'Fixture', competition_type: 'CUP', team_score: 2, opponent_score: 1 } }]
  const { html } = await renderServerPage('src/app/dashboard/page.tsx', { statistics, searchParams: { season: '2025-2026', comps: 'CUP' } })
  assert.match(html, /href="\/dashboard\/season-review\?season=2025-2026"/)
  assert.match(html, /Mon bilan de saison/)
})
