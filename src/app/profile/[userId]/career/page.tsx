import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { getClubLogo } from '@/utils/getClubLogo'
import { getCurrentSeason, summarizeSeasonStats, type MatchStatRecord } from '@/utils/playerStats'

interface CareerEntry {
  id: string
  season_start: number
  season_end: number
  is_free_agent: boolean
  club: string | null
  category: string | null
  is_youth: boolean
  is_verified: boolean
  has_stats: boolean
  matches_played: number
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  is_current?: boolean
}

export default async function CareerPage(props: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient()
  const targetUserId = (await props.params).userId

  const { data: profile, error: profileError } = await supabase.from('profiles').select('club, category').eq('id', targetUserId).single()

  if (profileError || !profile) return notFound()
  
  const { data: careerData, error } = await supabase
    .from('career_entries')
    .select('*')
    .eq('player_id', targetUserId)
    .order('season_end', { ascending: false })
    .returns<CareerEntry[]>()

  if (error) return notFound()

  const season = getCurrentSeason()
  const { data: currentStats, error: statsError } = await supabase
    .from('statistics')
    .select('has_played, minutes_played, goals, assists, yellow_cards, red_cards, is_motm, position_played, matches!inner(id, match_date, opponent, team_score, opponent_score, competition_type)')
    .eq('player_id', targetUserId)
    .gte('matches.match_date', season.startDate)
    .lt('matches.match_date', season.endDate)
    .returns<MatchStatRecord[]>()

  const totals = summarizeSeasonStats(currentStats ?? [], season)

  const isYouthCategory = profile?.category ? /U\d{1,2}/i.test(profile.category) : false
  
  const currentEntry: CareerEntry = {
    id: 'current',
    season_start: season.startYear,
    season_end: season.endYear,
    is_free_agent: !profile?.club,
    club: profile?.club || null,
    category: profile?.category || null,
    is_youth: isYouthCategory,
    is_verified: true,
    has_stats: !statsError,
    matches_played: totals.matchesPlayed,
    goals: totals.totalGoals,
    assists: totals.totalAssists,
    yellow_cards: totals.totalYellows,
    red_cards: totals.totalReds,
    is_current: true
  }

  const seniorCareer: CareerEntry[] = []
  const youthCareer: CareerEntry[] = []

  if (!careerData.find(c => c.season_start === season.startYear)) {
    if (isYouthCategory) youthCareer.push(currentEntry)
    else seniorCareer.push(currentEntry)
  }

  for (const entry of careerData) {
    if (entry.is_youth) youthCareer.push(entry)
    else seniorCareer.push(entry)
  }

  const renderTimeline = (entries: CareerEntry[], title: string) => {
    if (entries.length === 0) return null

    return (
      <div className="mb-12">
        <h3 className="text-xl font-extrabold text-slate-900 mb-4">{title}</h3>
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          
          <div className="hidden md:grid grid-cols-[100px_1fr_auto] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
            <div>Saison</div>
            <div>Club</div>
            <div className="flex gap-4 min-w-50 justify-end pr-2">
              <span className="w-8 text-center" title="Matchs Joués">M</span>
              <span className="w-8 text-center" title="Buts">⚽</span>
              <span className="w-8 text-center" title="Passes">👟</span>
              <span className="w-8 text-center" title="Jaunes">🟨</span>
              <span className="w-8 text-center" title="Rouges">🟥</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const seasonLabel = `${entry.season_start.toString().slice(-2)}/${entry.season_end.toString().slice(-2)}`
              const logo = getClubLogo(entry.club)

              if (entry.is_free_agent) {
                return (
                  <div key={entry.id} className="flex flex-col md:flex-row md:items-center px-6 py-4 gap-4 bg-slate-50/50 grayscale opacity-75">
                    <div className="flex items-center gap-2 w-24 shrink-0">
                      <span className="text-sm font-bold text-slate-400">{seasonLabel}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </div>
                      <span className="font-bold text-slate-500 italic">Sans club</span>
                      {entry.is_current && <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-md border border-slate-300">En cours</span>}
                    </div>
                  </div>
                )
              }

              return (
                <div key={entry.id} className="flex flex-col md:grid md:grid-cols-[100px_1fr_auto] md:items-center px-6 py-4 gap-4 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-sm font-black text-slate-600">{seasonLabel}</span>
                    {entry.is_current && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-md border border-emerald-200">En cours</span>}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="relative w-10 h-10 shrink-0 bg-white rounded-full border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                      {logo ? (
                        <Image src={logo} alt={entry.club!} fill className="object-contain p-1" sizes="40px" />
                      ) : (
                        <span className="text-slate-400 font-extrabold text-sm">{entry.club?.substring(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">{entry.club}</span>
                        {entry.is_verified && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500" aria-label="Club vérifié"><title>Vérifié</title><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                        )}
                      </div>
                      {entry.category && <span className="text-xs font-bold text-slate-500">{entry.category}</span>}
                    </div>
                  </div>

                  {entry.has_stats ? (
                    <div className="flex gap-4 md:min-w-50 md:justify-end mt-2 md:mt-0 bg-slate-50 md:bg-transparent p-2 md:p-0 rounded-lg border border-slate-100 md:border-none">
                      <div className="flex flex-col md:flex-row items-center w-8 text-center gap-1">
                        <span className="md:hidden text-[10px] text-slate-400 font-bold">M</span>
                        <span className="text-sm font-black text-slate-700">{entry.matches_played}</span>
                      </div>
                      <div className="flex flex-col md:flex-row items-center w-8 text-center gap-1">
                        <span className="md:hidden text-[10px] text-slate-400 font-bold">⚽</span>
                        <span className="text-sm font-bold text-slate-600">{entry.goals}</span>
                      </div>
                      <div className="flex flex-col md:flex-row items-center w-8 text-center gap-1">
                        <span className="md:hidden text-[10px] text-slate-400 font-bold">👟</span>
                        <span className="text-sm font-bold text-slate-600">{entry.assists}</span>
                      </div>
                      <div className="flex flex-col md:flex-row items-center w-8 text-center gap-1">
                        <span className="md:hidden text-[10px] text-slate-400 font-bold">🟨</span>
                        <span className="text-sm font-bold text-slate-600">{entry.yellow_cards}</span>
                      </div>
                      <div className="flex flex-col md:flex-row items-center w-8 text-center gap-1">
                        <span className="md:hidden text-[10px] text-slate-400 font-bold">🟥</span>
                        <span className="text-sm font-bold text-slate-600">{entry.red_cards}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-center items-center md:min-w-50 mt-2 md:mt-0 bg-slate-50 md:bg-transparent p-2 md:p-0 rounded-lg border border-slate-100 md:border-none">
                      <span className="text-xs font-bold text-slate-400 italic flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Non communiquées
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {statsError && (
        <p role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les statistiques de la saison actuelle. Réessayez plus tard.
        </p>
      )}
      {seniorCareer.length === 0 && youthCareer.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl border border-dashed border-slate-300 text-center text-slate-500">
          Pas de données historiques disponibles pour ce joueur.
        </div>
      ) : (
        <>
          {renderTimeline(seniorCareer, "Carrière Senior")}
          {renderTimeline(youthCareer, "Parcours Jeune")}
        </>
      )}
    </div>
  )
}
