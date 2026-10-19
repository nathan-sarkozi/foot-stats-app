import { parseUpcomingResponse, parseRankingsResponse, RbfaDataError, type UpcomingMatch, type Rankings } from '@/utils/rbfa-contracts'
import { parseRbfaStartTime } from '@/utils/rbfaDate'

export interface RbfaCacheRow {
  team_id: string
  upcoming_match: unknown
  rankings: unknown
  updated_at: string | null
}

export interface RbfaCacheWrite {
  team_id: string
  upcoming_match: UpcomingMatch | null
  rankings: Rankings | null
  updated_at: string
}

// The route supplies the Supabase adapter; tests use only synthetic responses.
export interface RbfaSyncStore {
  loadTeamIds(signal: AbortSignal): Promise<unknown[]>
  loadCache(teamIds: string[], signal: AbortSignal): Promise<RbfaCacheRow[]>
  upsert(row: RbfaCacheWrite, signal: AbortSignal): Promise<void>
}

type FailureCode = 'HTTP_ERROR' | 'REQUEST_ERROR' | 'REQUEST_TIMEOUT' | 'INVALID_JSON'
  | 'STALE_UPCOMING_MATCH' | 'DATABASE_READ_ERROR' | 'DATABASE_WRITE_ERROR'
  | 'DATABASE_TIMEOUT' | 'JOB_TIMEOUT'

export class RbfaSyncError extends Error {
  constructor(readonly code: FailureCode, readonly httpStatus?: number) {
    super(code)
    this.name = 'RbfaSyncError'
  }
}

interface TeamSyncResult {
  teamId: string
  status: 'updated' | 'unchanged' | 'failed' | 'skipped'
  write: 'succeeded' | 'failed' | 'not_attempted'
  cache: 'updated' | 'refreshed' | 'preserved' | 'unknown'
  reason?: FailureCode | 'GRAPHQL_ERROR' | 'INVALID_RESPONSE'
  httpStatus?: number
  warning?: 'TIME_ZONE_UNCONFIRMED'
}

export const RBFA_SYNC_LIMITS = { jobMs: 55_000, requestMs: 20_000, databaseMs: 5_000 } as const

const OPERATIONS = {
  upcoming: {
    operationName: 'GetUpcomingMatch',
    hash: '7e0aa25b6dbe45cede5f1a16320b091be9078a7b9d8cb9cb1402fc35292696fb',
  },
  rankings: {
    operationName: 'getSeriesAndRankingsQuery',
    hash: 'ace90f0250b37a504282e27289c62ea6a3f444ef8821f663bd1faa8e3689e358',
  },
} as const

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>, parent: AbortSignal,
  milliseconds: number, timeoutCode: 'REQUEST_TIMEOUT' | 'DATABASE_TIMEOUT',
): Promise<T> {
  if (parent.aborted) throw new RbfaSyncError('JOB_TIMEOUT')
  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  parent.addEventListener('abort', onParentAbort, { once: true })
  let rejectCancellation: (error: RbfaSyncError) => void = () => {}
  const cancelled = new Promise<never>((_resolve, reject) => { rejectCancellation = reject })
  const onAbort = () => rejectCancellation(new RbfaSyncError(parent.aborted ? 'JOB_TIMEOUT' : timeoutCode))
  controller.signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), milliseconds)
  try {
    return await Promise.race([operation(controller.signal), cancelled])
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onAbort)
    parent.removeEventListener('abort', onParentAbort)
  }
}

function safeFailure(error: unknown): { reason: TeamSyncResult['reason']; httpStatus?: number } {
  if (error instanceof RbfaDataError) return { reason: error.code }
  if (error instanceof RbfaSyncError) return { reason: error.code, ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) }
  return { reason: 'REQUEST_ERROR' }
}

async function fetchOperation(
  operation: typeof OPERATIONS[keyof typeof OPERATIONS], teamId: string,
  key: string, fetcher: typeof fetch, signal: AbortSignal, timeoutMs: number,
): Promise<unknown> {
  return withTimeout(async requestSignal => {
    const url = new URL('https://api.scraperapi.com')
    url.search = new URLSearchParams({
      api_key: key, url: 'https://datalake-prod2018.rbfa.be/graphql',
      keep_headers: 'true', premium: 'true', country_code: 'eu', timeout: '20000',
    }).toString()
    const response = await fetcher(url, {
      method: 'POST', signal: requestSignal, cache: 'no-store',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Origin: 'https://www.rbfa.be', Referer: 'https://www.rbfa.be/',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      body: JSON.stringify({
        operationName: operation.operationName, variables: { teamId, language: 'fr' },
        extensions: { persistedQuery: { version: 1, sha256Hash: operation.hash } },
      }),
    })
    // Never echo provider bodies, URLs, API keys or raw transport errors.
    if (!response.ok) throw new RbfaSyncError('HTTP_ERROR', response.status)
    try { return await response.json() } catch { throw new RbfaSyncError('INVALID_JSON') }
  }, signal, timeoutMs, 'REQUEST_TIMEOUT')
}

function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equalJson(value, right[index]))
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null
    || Array.isArray(left) || Array.isArray(right)) return false
  const first = Object.keys(left)
  const second = Object.keys(right)
  return first.length === second.length && first.every(key => Object.hasOwn(right, key)
    && equalJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}

export async function synchronizeRbfa({ store, scraperApiKey, fetcher = fetch, now = Date.now, limits = RBFA_SYNC_LIMITS }: {
  store: RbfaSyncStore
  scraperApiKey: string
  fetcher?: typeof fetch
  now?: () => number
  limits?: { jobMs: number; requestMs: number; databaseMs: number }
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), limits.jobMs)
  try {
    const rawIds = await withTimeout(signal => store.loadTeamIds(signal), controller.signal, limits.databaseMs, 'DATABASE_TIMEOUT')
    const validIds = rawIds.filter((value): value is string => typeof value === 'string' && /^\d{1,50}$/.test(value.trim()))
    const teamIds = [...new Set(validIds.map(value => value.trim()))].sort()
    const invalidTeamIds = rawIds.filter(value => value !== null
      && !(typeof value === 'string' && (value.trim() === '' || /^\d{1,50}$/.test(value.trim())))).length
    const cached = teamIds.length
      ? await withTimeout(signal => store.loadCache(teamIds, signal), controller.signal, limits.databaseMs, 'DATABASE_TIMEOUT') : []
    const previous = new Map(cached.map(row => [row.team_id, row]))
    // Oldest snapshots first if the overall deadline cannot serve every team.
    // Existing rows are never removed when profiles change their team.
    teamIds.sort((left, right) => {
      const date = (id: string) => Date.parse(previous.get(id)?.updated_at ?? '') || 0
      return date(left) - date(right)
    })
    const results: TeamSyncResult[] = []
    for (const teamId of teamIds) {
      if (controller.signal.aborted) {
        results.push({ teamId, status: 'skipped', write: 'not_attempted', cache: 'preserved', reason: 'JOB_TIMEOUT' })
        continue
      }
      let writeAttempted = false
      try {
        const teamController = new AbortController()
        const teamSignal = AbortSignal.any([controller.signal, teamController.signal])
        const [upcomingMatch, rankings] = await (async () => {
          try {
            // At most two ScraperAPI calls run together; teams stay sequential.
            return await Promise.all([
              fetchOperation(OPERATIONS.upcoming, teamId, scraperApiKey, fetcher, teamSignal, limits.requestMs).then(parseUpcomingResponse),
              fetchOperation(OPERATIONS.rankings, teamId, scraperApiKey, fetcher, teamSignal, limits.requestMs).then(parseRankingsResponse),
            ])
          } finally { teamController.abort() }
        })()
        const kickoff = parseRbfaStartTime(upcomingMatch?.startTime)
        if (kickoff !== null && kickoff <= now()) throw new RbfaSyncError('STALE_UPCOMING_MATCH')
        const old = previous.get(teamId)
        const unchanged = !!old && equalJson(old.upcoming_match, upcomingMatch) && equalJson(old.rankings, rankings)
        writeAttempted = true
        await withTimeout(signal => store.upsert({
          team_id: teamId, upcoming_match: upcomingMatch, rankings,
          updated_at: new Date(now()).toISOString(),
        }, signal), controller.signal, limits.databaseMs, 'DATABASE_TIMEOUT')
        results.push({
          teamId, status: unchanged ? 'unchanged' : 'updated', write: 'succeeded', cache: unchanged ? 'refreshed' : 'updated',
          ...(upcomingMatch?.startTime != null && kickoff === null ? { warning: 'TIME_ZONE_UNCONFIRMED' as const } : {}),
        })
      } catch (error) {
        results.push({
          teamId, status: 'failed', write: writeAttempted ? 'failed' : 'not_attempted',
          // A write whose response was lost may already have committed remotely.
          cache: writeAttempted ? 'unknown' : 'preserved', ...safeFailure(error),
        })
      }
    }
    const count = (status: TeamSyncResult['status']) => results.filter(result => result.status === status).length
    return {
      success: invalidTeamIds === 0 && !results.some(result => result.status === 'failed' || result.status === 'skipped'),
      summary: {
        teams: teamIds.length, updated: count('updated'), unchanged: count('unchanged'), failed: count('failed'), skipped: count('skipped'),
        writesSucceeded: results.filter(result => result.write === 'succeeded').length,
        writesFailed: results.filter(result => result.write === 'failed').length,
        invalidTeamIds,
      },
      results,
    }
  } finally { clearTimeout(timer) }
}
