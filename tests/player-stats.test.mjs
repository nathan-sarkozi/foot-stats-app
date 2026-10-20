import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { getCurrentSeason, summarizeSeasonStats } from '../src/utils/playerStats.ts'
import { cssModuleMock } from './helpers/load-ui-module.mjs'
import { PUBLIC_USER_ID, renderServerPage } from './helpers/render-server-page.mjs'

// Run offline: node --test --test-isolation=none tests/player-stats.test.mjs
const season = getCurrentSeason(new Date(2026, 9, 19))
const statistic = (id, values = {}, match = {}) => ({
  has_played: true, minutes_played: 80, goals: 1, assists: 2,
  yellow_cards: 0, red_cards: 0, is_motm: false, position_played: 'MC',
  ...values,
  matches: {
    id, match_date: '2026-10-18', opponent: `Synthetic opponent ${id}`,
    team_score: 2, opponent_score: 1, competition_type: 'LEAGUE', ...match,
  },
})

test('current season changes on July 1 and remains stable across New Year', () => {
  assert.deepEqual(getCurrentSeason(new Date(2026, 5, 30)), {
    startYear: 2025, endYear: 2026, startDate: '2025-07-01', endDate: '2026-07-01',
  })
  assert.deepEqual(getCurrentSeason(new Date(2026, 6, 1)), season)
  assert.deepEqual(getCurrentSeason(new Date(2027, 0, 1)), season)
})

test('no statistics produces finite zero totals and empty history/chart', () => {
  const result = summarizeSeasonStats([], season)
  for (const key of ['matchesPlayed', 'totalGoals', 'totalAssists', 'totalMinutes',
    'totalYellows', 'totalReds', 'totalMotm', 'totalWins', 'totalGA', 'winRate', 'minsPerGoal']) {
    assert.equal(result[key], 0, key)
  }
  assert.equal(result.assistsPerMatch, '0')
  assert.equal(result.goalSubtitle, '0 but')
  assert.equal(result.favPosition, 'N/A')
  assert.equal(result.maxPosCount, 0)
  assert.deepEqual(result.displayStats, [])
  assert.deepEqual(result.chartData, [])
})

test('two yellows plus their red count as two yellows and one expulsion, including on the bench', () => {
  for (const has_played of [true, false]) {
    const result = summarizeSeasonStats([statistic('cards', { has_played, yellow_cards: 2, red_cards: 1 })], season)
    assert.equal(result.totalYellows, 2)
    assert.equal(result.totalReds, 1)
    assert.equal(result.totalYellows + result.totalReds, 3, 'the existing total counts cards, not distinct expulsions')
    assert.equal(result.matchesPlayed, has_played ? 1 : 0)
  }
})

test('assists per appearance does not depend on scoring any goals', () => {
  const result = summarizeSeasonStats([
    statistic('a', { goals: 0, assists: 3 }),
    statistic('b', { goals: 0, assists: 0 }),
  ], season)
  assert.equal(result.matchesPlayed, 2)
  assert.equal(result.totalGoals, 0)
  assert.equal(result.totalAssists, 3)
  assert.equal(result.assistsPerMatch, '1.50')
})

test('discipline counts without participation while playing statistics remain excluded', () => {
  const result = summarizeSeasonStats([statistic('bench', {
    has_played: false, yellow_cards: 1, red_cards: 1,
    goals: 7, assists: 8, minutes_played: 90, is_motm: true,
  })], season)
  assert.equal(result.totalYellows, 1)
  assert.equal(result.totalReds, 1)
  assert.equal(result.displayStats.length, 1)
  for (const key of ['matchesPlayed', 'totalGoals', 'totalAssists', 'totalMinutes',
    'totalMotm', 'totalWins', 'totalGA', 'winRate']) assert.equal(result[key], 0, key)
  assert.equal(result.assistsPerMatch, '0')
  assert.equal(result.favPosition, 'N/A')
  assert.equal(result.chartData[0].goals, 0)
  assert.equal(result.chartData[0].assists, 0)
})

test('non-participation without any cards remains in history with zero totals', () => {
  const result = summarizeSeasonStats([statistic('bench', { has_played: false })], season)
  assert.equal(result.displayStats.length, 1)
  assert.equal(result.matchesPlayed, 0)
  assert.equal(result.totalYellows + result.totalReds, 0)
})

test('season boundaries include July 1 and June 30 and exclude other seasons', () => {
  const result = summarizeSeasonStats([
    statistic('old', { goals: 41, yellow_cards: 2 }, { match_date: '2026-06-30' }),
    statistic('start', { goals: 2 }, { match_date: '2026-07-01' }),
    statistic('end', { goals: 3 }, { match_date: '2027-06-30' }),
    statistic('next', { goals: 43, red_cards: 1 }, { match_date: '2027-07-01' }),
  ], season)
  assert.equal(result.matchesPlayed, 2)
  assert.equal(result.totalGoals, 5)
  assert.equal(result.totalYellows + result.totalReds, 0)
  assert.deepEqual(result.displayStats.map(s => s.matches.id), ['end', 'start'])
  assert.deepEqual(result.chartData.map(point => point.goals), [2, 5])
})

test('competition filters apply equally to history, charts, playing totals and cards', () => {
  const rows = [
    statistic('league', { goals: 5, yellow_cards: 1 }),
    statistic('cup', { has_played: false, red_cards: 1 }, { competition_type: 'CUP' }),
    statistic('friendly', { assists: 4 }, { competition_type: 'FRIENDLY' }),
  ]
  const cup = summarizeSeasonStats(rows, season, ['CUP'])
  assert.equal(cup.matchesPlayed, 0)
  assert.equal(cup.totalGoals + cup.totalAssists + cup.totalYellows, 0)
  assert.equal(cup.totalReds, 1)
  assert.deepEqual(cup.displayStats.map(s => s.matches.id), ['cup'])
  assert.equal(cup.chartData.length, 1)
  assert.equal(summarizeSeasonStats(rows, season, []).displayStats.length, 0)
})

test('chronological cumulative charts preserve ties and do not mutate input order', () => {
  const rows = [
    statistic('late', { assists: 1 }, { match_date: '2026-10-20' }),
    statistic('early', { goals: 2, assists: 3 }, { match_date: '2026-07-01' }),
    statistic('bench', { has_played: false }, { match_date: '2026-09-01' }),
  ]
  const snapshot = structuredClone(rows)
  const result = summarizeSeasonStats(rows, season)
  assert.deepEqual(rows, snapshot)
  assert.deepEqual(result.chartData.map(p => [p.goals, p.assists]), [[2, 3], [2, 3], [3, 4]])
  assert.deepEqual(result.displayStats.map(s => s.matches.id), ['late', 'bench', 'early'])
  assert.equal(result.favPosition, 'MC')
  assert.equal(result.maxPosCount, 2)
  assert.equal(result.totalWins, 2)
  assert.equal(result.winRate, 100)
})

test('nullable legacy numeric values do not produce NaN', () => {
  const result = summarizeSeasonStats([statistic('legacy', {
    goals: null, assists: null, minutes_played: null,
    yellow_cards: null, red_cards: null, is_motm: null,
  })], season)
  assert.equal(result.matchesPlayed, 1)
  assert.equal(result.totalGoals + result.totalAssists + result.totalMinutes, 0)
  assert.equal(result.totalYellows + result.totalReds, 0)
  assert.equal(result.assistsPerMatch, '0.00')
})

test('nullable scores preserve statistical totals while both presentations identify an incomplete score', async () => {
  for (const teamScore of [null, 0, 1, 2]) {
    for (const opponentScore of [null, 0, 1, 2]) {
      const rows = [statistic('nullable-score', {}, { team_score: teamScore, opponent_score: opponentScore })]
      // Reproduce the original JavaScript comparisons, including null coercion.
      const isWin = teamScore > opponentScore
      const isLoss = teamScore < opponentScore
      const result = summarizeSeasonStats(rows, season)
      const label = `${teamScore} against ${opponentScore}`
      assert.equal(result.totalWins, isWin ? 1 : 0, label)
      for (const page of ['src/app/dashboard/page.tsx', 'src/app/profile/[userId]/page.tsx']) {
        const { html, cards } = await renderServerPage(page, { statistics: rows })
        assert.equal(cards.find(card => card.title === 'Ratio Victoires').value, teamScore === null || opponentScore === null ? '—' : `${isWin ? 100 : 0}%`, `${page}: ${label}`)
        assert.ok(html.includes(`data-outcome="${teamScore === null || opponentScore === null ? 'unknown' : isWin ? 'win' : isLoss ? 'loss' : 'draw'}"`), `${page}: ${label}`)
      }
    }
  }
})

test('FormGuide retains its original strict draw equality for nullable scores', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../src/app/dashboard/components/FormGuide.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: 'FormGuide.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loadedModule = { exports: {} }
  new vm.Script(compiled, { filename: 'FormGuide.tsx' }).runInContext(vm.createContext({
    module: loadedModule, exports: loadedModule.exports,
    require(name) {
      if (name.endsWith('.module.css')) return cssModuleMock
      assert.equal(name, 'react/jsx-runtime')
      return require(name)
    },
  }))
  const FormGuide = loadedModule.exports.default
  for (const teamScore of [null, 0, 1, 2]) {
    for (const opponentScore of [null, 0, 1, 2]) {
      const html = renderToStaticMarkup(React.createElement(FormGuide, {
        recentMatches: [{ team_score: teamScore, opponent_score: opponentScore }],
      }))
      const expected = teamScore > opponentScore ? 'V' : teamScore === opponentScore ? 'N' : 'D'
      assert.ok(html.includes(`>${expected}</div>`), `${teamScore} against ${opponentScore}`)
    }
  }
})

test('positive goals never receive a zero-goals subtitle when the ratio rounds to zero', () => {
  for (const [minutes, goals] of [[0, 1], [1, 3]]) {
    const result = summarizeSeasonStats([statistic('goal', { minutes_played: minutes, goals })], season)
    assert.equal(result.goalSubtitle, '1 but / 0 min')
    assert.equal(result.totalGoals, goals)
  }
})

for (const page of ['src/app/dashboard/page.tsx', 'src/app/profile/[userId]/page.tsx']) {
  test(`${page}: assists labels and graph title are explicit without changing displayed totals`, async () => {
    for (const assists of [0, 1, 2]) {
      const { html, cards } = await renderServerPage(page, { statistics: [statistic('wording', { goals: 1, assists })] })
      const label = assists === 1 ? 'passe décisive' : 'passes décisives'
      assert.equal(cards.find(card => card.title === 'Passes décisives').value, assists)
      assert.equal(cards.find(card => card.title === 'G/A (Impliqué)').subtitle, `1 but | ${assists} ${label}`)
      assert.match(html, /Cumul des buts et des passes décisives/)
      if (page.includes('/profile/') && assists > 0) assert.ok(html.replace(/<[^>]*>/g, '').includes(`${assists} ${label}`))
      assert.doesNotMatch(html, /Total Passes/)
    }
  })

  test(`${page}: actual cards and queries use current-season totals`, async () => {
    const rows = [
      statistic('old', { goals: 41 }, { match_date: '2026-06-30' }),
      statistic('a', { goals: 0, assists: 3 }),
      statistic('b', { goals: 0, assists: 0 }),
      statistic('next', { goals: 43 }, { match_date: '2027-07-01' }),
    ]
    const { cards, queries, charts, html } = await renderServerPage(page, { statistics: rows })
    assert.equal(cards.find(c => c.title === 'Matchs Joués').value, 2)
    assert.equal(cards.find(c => c.title === 'Total Buts').value, 0)
    assert.equal(cards.find(c => c.title === 'Passes décisives').subtitle, '1.50 par match')
    assert.equal(charts[0].length, 2)
    assert.doesNotMatch(html, /Synthetic opponent old|Synthetic opponent next/)
    const query = queries.find(q => q.table === 'statistics')
    assert.deepEqual(query.filters, [
      { method: 'eq', args: ['player_id', page.includes('/profile/') ? PUBLIC_USER_ID : 'test-player'] },
      { method: 'gte', args: ['matches.match_date', '2026-07-01'] },
      { method: 'lt', args: ['matches.match_date', '2027-07-01'] },
    ])
  })

  test(`${page}: a bench-only history shows the match and its cards`, async () => {
    const { html, cards } = await renderServerPage(page, {
      statistics: [statistic('bench', { has_played: false, yellow_cards: 1, red_cards: 1 })],
    })
    assert.equal(cards.find(c => c.title === 'Matchs Joués').value, 0)
    assert.equal(cards.find(c => c.title === 'Discipline').value, 2)
    assert.match(html, /Synthetic opponent bench/)
    assert.match(html, /pas joué/)
    assert.match(html.replace(/<[^>]*>/g, ''), /🟨 1/)
    assert.match(html.replace(/<[^>]*>/g, ''), /🟥 1/)
    assert.doesNotMatch(html, /Aucun match enregistré/)
  })

  test(`${page}: positive goals with zero minutes have the correct subtitle`, async () => {
    const { cards } = await renderServerPage(page, { statistics: [statistic('goal', { minutes_played: 0 })] })
    assert.equal(cards.find(c => c.title === 'Total Buts').value, 1)
    assert.equal(cards.find(c => c.title === 'Total Buts').subtitle, '1 but / 0 min')
  })

  test(`${page}: a genuinely empty history still has its empty state`, async () => {
    const { html, cards, charts } = await renderServerPage(page)
    assert.match(html, /Aucun match enregistré/)
    assert.equal(cards.find(c => c.title === 'Matchs Joués').value, '—')
    assert.equal(cards.find(c => c.title === 'Passes décisives').subtitle, 'Non communiqué')
    assert.deepEqual(charts, [[]])
    assert.doesNotMatch(html, /NaN|Infinity/)
  })

  test(`${page}: nullable legacy statistics stay unknown without hiding the match`, async () => {
    const { html, cards } = await renderServerPage(page, {
      statistics: [statistic('legacy', {
        goals: null, assists: null, minutes_played: null,
        yellow_cards: null, red_cards: null, is_motm: null,
      })],
    })
    assert.equal(cards.find(c => c.title === 'Total Buts').value, '—')
    assert.equal(cards.find(c => c.title === 'Discipline').value, '—')
    assert.match(html, /Synthetic opponent legacy/)
    if (page.includes('/profile/')) assert.match(html, /—′<\/b> minutes/)
    else assert.match(html, /—.*minutes/)
    assert.doesNotMatch(html, /NaN|Infinity/)
  })
}

test('dashboard competition selection filters discipline as well as performances', async () => {
  const { html, cards, charts } = await renderServerPage('src/app/dashboard/page.tsx', {
    searchParams: { comps: 'CUP' },
    statistics: [
      statistic('league', { goals: 8, yellow_cards: 1 }),
      statistic('cup', { has_played: false, red_cards: 1 }, { competition_type: 'CUP' }),
    ],
  })
  assert.equal(cards.find(c => c.title === 'Discipline').value, 1)
  assert.equal(cards.find(c => c.title === 'Matchs Joués').value, 0)
  assert.equal(charts[0].length, 1)
  assert.match(html, /Synthetic opponent cup/)
  assert.doesNotMatch(html, /Synthetic opponent league/)
})
