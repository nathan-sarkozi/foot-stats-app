// Copied ONLY into the temporary preview by scripts/preview-seasons.mjs.
// No Supabase SDK, token or HTTP transport. Only goals mode can mutate its private JSON.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
const fixturePath = '__FIXTURE_PATH__'
const allowGoalWrites = '__ALLOW_GOAL_WRITES__' === 'true'
const state = () => JSON.parse(readFileSync(fixturePath, 'utf8'))
const denied = async () => { throw new Error('Démonstration locale : écriture désactivée.') }
const error = (code, message) => ({ data: null, error: { code, message } })

export async function createClient() {
  const requestHeaders = await headers()
  const scenario = requestHeaders.get('x-footstats-demo-scenario')
  const anonymous = requestHeaders.get('x-footstats-demo-visitor') === 'anonymous'
  const initial = state()
  const playerId = (initial.scenarios?.[scenario] ?? initial).profiles[0].id
  return {
    auth: { getUser: async () => ({ data: { user: anonymous ? null : { id: playerId } }, error: null }), signOut: denied, signInWithPassword: denied, signUp: denied },
    rpc: denied,
    storage: { from: () => ({ upload: denied, remove: denied }) },
    from(table) {
      if (!['profiles', 'matches', 'statistics', 'career_entries', 'rbfa_cache', 'season_goals'].includes(table)) throw new Error('Table outside local fixture scope')
      const filters = []
      let sorting = null, ascending = true, start = 0, end = Infinity, projection = '', operation = null, payload = null, returnRows = false, result
      const value = (row, key) => key.split('.').reduce((current, part) => current?.[part], row)
      const matches = row => filters.every(([key, method, expected]) => method === 'eq' ? value(row, key) === expected : method === 'gte' ? value(row, key) >= expected : value(row, key) < expected)
      const execute = (single = false) => {
        // A query builder is a thenable; awaiting it twice must not apply a write twice.
        if (result) return result
        const fixture = state()
        const data = fixture.scenarios?.[scenario] ?? fixture
        let rows = data[table] ?? []
        if (data.enforceProfileReadPolicies && anonymous && ['profiles', 'matches', 'statistics'].includes(table)) rows = []
        if (operation) {
          if (!allowGoalWrites || table !== 'season_goals') throw new Error('Démonstration locale : écriture désactivée.')
          if (operation !== 'insert' && !filters.some(([key, method, expected]) => key === 'player_id' && method === 'eq' && expected === playerId)) return error('42501', 'Propriétaire requis pour cette écriture fictive.')
          if (operation === 'insert') {
            if (!payload || Array.isArray(payload) || Object.keys(payload).some(key => !['season_start', 'metric', 'target'].includes(key))) return error('42501', 'Colonnes non autorisées.')
            if (!Number.isInteger(payload.season_start) || payload.season_start < 1 || payload.season_start > 9998 || !['goals', 'assists', 'appearances', 'motm'].includes(payload.metric) || !Number.isInteger(payload.target) || payload.target < 1 || payload.target > 2147483647) return error('23514', 'Objectif fictif invalide.')
            if (rows.some(row => row.player_id === playerId && row.season_start === payload.season_start && row.metric === payload.metric)) return error('23505', 'Cet objectif existe déjà pour cette saison.')
            const row = { ...payload, id: randomUUID(), player_id: playerId, created_at: new Date().toISOString() }
            data.season_goals = [...rows, row]
            rows = [row]
          } else {
            const selected = rows.filter(row => row.player_id === playerId && matches(row))
            if (operation === 'update') {
              if (!payload || Array.isArray(payload) || Object.keys(payload).some(key => key !== 'target')) return error('42501', 'Seule la cible est modifiable.')
              if (!Number.isInteger(payload.target) || payload.target < 1 || payload.target > 2147483647) return error('23514', 'Cible fictive invalide.')
              data.season_goals = rows.map(row => selected.includes(row) ? { ...row, target: payload.target } : row)
              rows = selected.map(row => ({ ...row, target: payload.target }))
            } else {
              data.season_goals = rows.filter(row => !selected.includes(row))
              rows = selected
            }
          }
          writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
          result = { data: returnRows ? single ? rows[0] ?? null : rows : null, error: null }
          return result
        }
        if (table === 'statistics') rows = rows.map(row => ({ ...row, matches: data.matches.find(match => match.id === row.match_id) }))
        if (table === 'matches' && projection.includes('statistics')) rows = rows.map(row => ({ ...row, statistics: data.statistics.find(stat => stat.match_id === row.id) ?? null }))
        rows = rows.filter(row => (table !== 'season_goals' || row.player_id === playerId) && matches(row))
        if (sorting) rows = [...rows].sort((a, b) => (value(a, sorting) > value(b, sorting) ? 1 : value(a, sorting) < value(b, sorting) ? -1 : 0) * (ascending ? 1 : -1))
        rows = rows.slice(start, end)
        return { data: single ? rows[0] ?? null : rows, error: null }
      }
      const mutate = (kind, values) => {
        if (!allowGoalWrites || table !== 'season_goals') return denied()
        operation = kind; payload = values
        return builder
      }
      const builder = {
        select(value = '') { projection = value; returnRows = true; return builder },
        eq(key, expected) { filters.push([key, 'eq', expected]); return builder },
        match(values) { for (const [key, expected] of Object.entries(values)) filters.push([key, 'eq', expected]); return builder },
        gte(key, expected) { filters.push([key, 'gte', expected]); return builder },
        lt(key, expected) { filters.push([key, 'lt', expected]); return builder },
        order(key, options) { sorting = key; ascending = options?.ascending !== false; return builder },
        range(first, last) { start = first; end = last + 1; return builder },
        limit(count) { end = start + count; return builder },
        abortSignal() { return builder },
        insert: values => mutate('insert', values), update: values => mutate('update', values), upsert: denied, delete: () => mutate('delete'),
        single: async () => execute(true), maybeSingle: async () => execute(true),
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject) },
      }
      return builder
    },
  }
}
