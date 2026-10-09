import { createClient } from '@/utils/supabase/server' // Assure-toi que le chemin est correct selon ton projet

export async function getUpcomingMatch(teamId: string) {
  if (!teamId) return null
  
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rbfa_cache')
    .select('upcoming_match')
    .eq('team_id', teamId)
    .single()

  if (error || !data) return null
  return data.upcoming_match
}

export async function getTeamRankings(teamId: string) {
  if (!teamId) return null
  
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rbfa_cache')
    .select('rankings')
    .eq('team_id', teamId)
    .single()

  if (error || !data) return null
  return data.rankings
}