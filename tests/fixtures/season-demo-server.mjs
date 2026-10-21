// Copied ONLY into the temporary preview by scripts/preview-seasons.mjs.
// No Supabase SDK, token, HTTP transport or write capability.
import { readFileSync } from 'node:fs'
import { headers } from 'next/headers'
const state = () => JSON.parse(readFileSync('__FIXTURE_PATH__', 'utf8'))
const denied = async () => { throw new Error('Démonstration locale : écriture désactivée.') }

export async function createClient() {
  const fixture = state()
  const scenario = (await headers()).get('x-footstats-demo-scenario')
  const data = fixture.scenarios?.[scenario] ?? fixture
  return {
    auth: { getUser: async () => ({ data: { user: { id: data.profiles[0].id } }, error: null }), signOut: denied, signInWithPassword: denied, signUp: denied },
    rpc: denied,
    storage: { from: () => ({ upload: denied, remove: denied }) },
    from(table) {
      if (!['profiles', 'matches', 'statistics', 'career_entries', 'rbfa_cache'].includes(table)) throw new Error('Table outside local fixture scope')
      const filters = []
      let sorting = null, ascending = true, start = 0, end = Infinity, projection = ''
      const value = (row, key) => key.split('.').reduce((current, part) => current?.[part], row)
      const execute = (single = false) => {
        let rows = data[table]
        if (table === 'statistics') rows = rows.map(row => ({ ...row, matches: data.matches.find(match => match.id === row.match_id) }))
        if (table === 'matches' && projection.includes('statistics')) rows = rows.map(row => ({ ...row, statistics: data.statistics.find(stat => stat.match_id === row.id) ?? null }))
        rows = rows.filter(row => filters.every(([key, method, expected]) => method === 'eq' ? value(row, key) === expected : method === 'gte' ? value(row, key) >= expected : value(row, key) < expected))
        if (sorting) rows = [...rows].sort((a, b) => (value(a, sorting) > value(b, sorting) ? 1 : value(a, sorting) < value(b, sorting) ? -1 : 0) * (ascending ? 1 : -1))
        rows = rows.slice(start, end)
        return { data: single ? rows[0] ?? null : rows, error: null }
      }
      const builder = {
        select(value = '') { projection = value; return builder },
        eq(key, expected) { filters.push([key, 'eq', expected]); return builder },
        gte(key, expected) { filters.push([key, 'gte', expected]); return builder },
        lt(key, expected) { filters.push([key, 'lt', expected]); return builder },
        order(key, options) { sorting = key; ascending = options?.ascending !== false; return builder },
        range(first, last) { start = first; end = last + 1; return builder },
        limit(count) { end = start + count; return builder },
        abortSignal() { return builder },
        insert: denied, update: denied, upsert: denied, delete: denied,
        single: async () => execute(true), maybeSingle: async () => execute(true),
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject) },
      }
      return builder
    },
  }
}
