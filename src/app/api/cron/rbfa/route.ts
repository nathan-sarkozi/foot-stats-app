import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { synchronizeRbfa, RbfaSyncError, type RbfaCacheRow, type RbfaSyncStore } from '@/services/rbfa-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isAuthorized =
    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) ||
    (process.env.CRON_SECRET_2 && authHeader === `Bearer ${process.env.CRON_SECRET_2}`)
  if (!isAuthorized) return new NextResponse('Unauthorized', { status: 401 })

  const scraperApiKey = process.env.SCRAPER_API_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!scraperApiKey || !supabaseUrl || !serviceRoleKey) {
    console.error('RBFA cron failed', { code: 'CONFIGURATION_ERROR' })
    return NextResponse.json({ success: false, code: 'CONFIGURATION_ERROR' }, { status: 500 })
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const store: RbfaSyncStore = {
      async loadTeamIds(signal) {
        const { data, error } = await supabase.from('profiles').select('rbfa_team_id')
          .returns<{ rbfa_team_id: string | null }[]>().abortSignal(signal)
        if (error || !data) throw new RbfaSyncError('DATABASE_READ_ERROR')
        return data.map(row => row.rbfa_team_id)
      },
      async loadCache(teamIds, signal) {
        const { data, error } = await supabase.from('rbfa_cache')
          .select('team_id, upcoming_match, rankings, updated_at').in('team_id', teamIds)
          .returns<RbfaCacheRow[]>().abortSignal(signal)
        if (error || !data) throw new RbfaSyncError('DATABASE_READ_ERROR')
        return data
      },
      async upsert(row, signal) {
        const { data, error } = await supabase.from('rbfa_cache').upsert(row, { onConflict: 'team_id' })
          .select('team_id').abortSignal(signal).single()
        if (error || data?.team_id !== row.team_id) throw new RbfaSyncError('DATABASE_WRITE_ERROR')
      },
    }
    const result = await synchronizeRbfa({ store, scraperApiKey })
    for (const team of result.results) {
      if (team.status === 'failed' || team.status === 'skipped') {
        console.error('RBFA team sync failed', { teamId: team.teamId, code: team.reason, httpStatus: team.httpStatus })
      }
    }
    console.info('RBFA sync completed', result.summary)
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error) {
    const code = error instanceof RbfaSyncError ? error.code : 'SYNC_ERROR'
    console.error('RBFA cron failed', { code })
    return NextResponse.json({ success: false, code }, { status: 500 })
  }
}
