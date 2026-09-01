import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/app/dashboard/components/Navbar'
import StatCard from '@/app/dashboard/components/StatCard'

interface ProfilePageProps {
  params: Promise<{
    userId: string
  }>
}

export default async function PublicProfilePage(props: ProfilePageProps) {
  const supabase = await createClient()
  
  const resolvedParams = await props.params
  const targetUserId = resolvedParams.userId

  // 1. REQUÊTE MISE À JOUR : Ajout des attributs physiques
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, club, category, preferred_position, foot_preference, jersey_number, height, weight')
    .eq('id', targetUserId)
    .single()

  if (profileError || !profile) {
    console.error('Profile Fetch Error:', profileError?.message)
    return notFound()
  }

  const { data: stats, error: statsError } = await supabase
    .from('statistics')
    .select(`
      goals, assists, yellow_cards, red_cards, minutes_played, has_played, is_motm, position_played,
      matches ( opponent, match_date, competition_type, team_score, opponent_score )
    `)
    .eq('player_id', targetUserId)

  if (statsError || !stats) {
    console.error('Stats Fetch Error:', statsError?.message)
    return notFound()
  }

  const sortedStats = [...stats].sort((a, b) => {
    const matchA = Array.isArray(a.matches) ? a.matches[0] : a.matches
    const matchB = Array.isArray(b.matches) ? b.matches[0] : b.matches
    if (!matchA || !matchB) return 0
    return new Date(matchB.match_date).getTime() - new Date(matchA.match_date).getTime()
  })

  const matchesPlayed = stats.filter(s => s.has_played).length
  const totalGoals = stats.reduce((acc, curr) => acc + (curr.goals || 0), 0)
  const totalAssists = stats.reduce((acc, curr) => acc + (curr.assists || 0), 0)
  const totalMinutes = stats.reduce((acc, curr) => acc + (curr.minutes_played || 0), 0)
  const totalYellows = stats.reduce((acc, curr) => acc + (curr.yellow_cards || 0), 0)
  const totalReds = stats.reduce((acc, curr) => acc + (curr.red_cards || 0), 0)
  const totalMotm = stats.filter(s => s.is_motm).length
  
  const positionCounts = stats.reduce((acc, stat) => {
    if (stat.position_played) {
      acc[stat.position_played] = (acc[stat.position_played] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  let favPosition = 'N/A'
  let maxPosCount = 0
  for (const [pos, count] of Object.entries(positionCounts)) {
    if (count > maxPosCount) {
      maxPosCount = count
      favPosition = pos
    }
  }

  const totalGA = totalGoals + totalAssists
  const p90Goals = totalMinutes > 0 ? ((totalGoals / totalMinutes) * 90).toFixed(2) : '0.00'
  const p90Assists = totalMinutes > 0 ? ((totalAssists / totalMinutes) * 90).toFixed(2) : '0.00'

  const getCompetitionLabel = (type: string) => {
    if (type === 'LEAGUE') return 'Championnat'
    if (type === 'CUP') return 'Coupe'
    if (type === 'FRIENDLY') return 'Amical'
    return type
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar initials="FS" />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        <div className="mb-6">
          <Link 
            href="/dashboard/community" 
            className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          >
            &larr; Retour à la communauté
          </Link>
        </div>

        {/* EN-TÊTE MODERNISÉ AVEC ATTRIBUTS PHYSIQUES */}
        <header className="mb-8 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-start gap-6">
          <div className="h-24 w-24 shrink-0 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-extrabold text-4xl border border-indigo-100">
            {profile.display_name.substring(0, 2).toUpperCase()}
          </div>
          
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{profile.display_name}</h1>
              {profile.preferred_position && (
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider rounded-lg border border-indigo-100">
                  {profile.preferred_position}
                </span>
              )}
            </div>
            
            {(profile.club || profile.category) ? (
              <p className="text-slate-600 font-medium mt-2 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
                {profile.club || 'Club non renseigné'} {profile.category && <span className="text-slate-400">• {profile.category}</span>}
              </p>
            ) : (
              <p className="text-slate-400 font-medium mt-2 italic flex items-center gap-2">
                Agent libre
              </p>
            )}

            {/* Badges d'attributs physiques */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {profile.jersey_number && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">
                  N° {profile.jersey_number}
                </span>
              )}
              {profile.foot_preference && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">
                  🦶 {profile.foot_preference}
                </span>
              )}
              {profile.height && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">
                  📏 {profile.height} cm
                </span>
              )}
              {profile.weight && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-md border border-slate-200">
                  ⚖️ {profile.weight} kg
                </span>
              )}
            </div>
            
            <p className="text-slate-400 text-xs mt-4 font-mono bg-slate-50 inline-block px-2 py-1 rounded">ID: {targetUserId.split('-')[0]}</p>
          </div>
        </header>

        {/* ... (Le reste du code, grilles et historique, reste strictement identique) ... */}
        
        {/* Grille de statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-12">
          <StatCard title="Poste Favori" value={favPosition} subtitle={`${maxPosCount} matchs joués`} delay={0.1} highlight />
          <StatCard title="Homme du Match" value={totalMotm} subtitle="Trophées 🏆" delay={0.2} highlight />
          <StatCard title="Matchs Joués" value={matchesPlayed} subtitle={`${totalMinutes} min cumulées`} delay={0.3} />
          <StatCard title="G/A (Impliqué)" value={totalGA} subtitle={`${totalGoals} B | ${totalAssists} P`} delay={0.4} />
          
          <StatCard title="Total Buts" value={totalGoals} subtitle={`${p90Goals} Buts / 90 min`} delay={0.5} />
          <StatCard title="Total Passes" value={totalAssists} subtitle={`${p90Assists} Passes / 90 min`} delay={0.6} />
          <StatCard title="Cartons Jaunes" value={totalYellows} subtitle="🟨 Avertissements" delay={0.7} />
          <StatCard title="Cartons Rouges" value={totalReds} subtitle="🟥 Expulsions" delay={0.8} />
        </div>

        {/* Historique */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Historique des matchs</h2>
          
          {matchesPlayed === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-dashed border-slate-300 text-center text-slate-500">
              Aucun match enregistré pour le moment.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedStats.map((stat, index) => {
                const match = Array.isArray(stat.matches) ? stat.matches[0] : stat.matches
                if (!match) return null

                const dateStr = new Date(match.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                const isWin = match.team_score > match.opponent_score
                const isLoss = match.team_score < match.opponent_score
                const resultColor = isWin ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isLoss ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-800 border-slate-200'

                return (
                  <div key={index} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-5">
                      <div className="shrink-0 text-center min-w-[3rem]">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">{dateStr}</span>
                        <span className={`mt-1.5 inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold border ${resultColor}`}>
                          {match.team_score} - {match.opponent_score}
                        </span>
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-slate-900">vs {match.opponent}</p>
                          {stat.is_motm && <span title="Homme du Match" className="text-lg">🏆</span>}
                        </div>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">{getCompetitionLabel(match.competition_type)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center flex-wrap gap-2 pt-4 sm:pt-0 border-t sm:border-0 border-slate-100">
                      {stat.has_played ? (
                        <>
                          {stat.position_played && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold border border-slate-200">
                              {stat.position_played}
                            </span>
                          )}
                          {stat.goals > 0 && <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-bold border border-emerald-100">⚽ {stat.goals}</span>}
                          {stat.assists > 0 && <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">👟 {stat.assists}</span>}
                          {stat.yellow_cards > 0 && <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs font-bold border border-amber-100">🟨 {stat.yellow_cards}</span>}
                          {stat.red_cards > 0 && <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs font-bold border border-red-100">🟥 {stat.red_cards}</span>}
                          <span className="text-slate-400 font-medium text-sm ml-2">{stat.minutes_played}&apos;</span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-slate-400 bg-slate-50 px-3 py-1 rounded-full">N&apos;a pas joué</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}