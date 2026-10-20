import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import StatCard from '@/app/dashboard/components/StatCard'
import StatsChart from '@/app/dashboard/components/StatsChart'
import TeamWidget from '@/app/dashboard/components/TeamWidget'
import PublicMatchCard from './components/PublicMatchCard'
import s from './profile.module.css'
import d from '@/app/dashboard/stade.module.css'
import { Suspense } from 'react'
import { getCurrentSeason, summarizeSeasonStats } from '@/utils/playerStats'
import { checkReadError, resourceIdSchema } from '@/utils/readErrors'

export default async function CurrentSeasonPage(props: { params: Promise<{ userId: string }> }) {
  const targetUserId = (await props.params).userId
  if (!resourceIdSchema.safeParse(targetUserId).success) return notFound()
  const supabase = await createClient()

  // NOUVEAU : On récupère l'ID RBFA du joueur ciblé
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('rbfa_team_id')
    .eq('id', targetUserId)
    .maybeSingle()

  checkReadError(profileError, 'Lecture du profil de saison')
  if (!profileData) return notFound()

  const season = getCurrentSeason()
  const { data: statsData, error: statsError } = await supabase
    .from('statistics')
    .select(`
      goals, assists, yellow_cards, red_cards, minutes_played, has_played, is_motm, position_played,
      matches!inner ( id, opponent, match_date, competition_type, team_score, opponent_score )
    `)
    .eq('player_id', targetUserId)
    .gte('matches.match_date', season.startDate)
    .lt('matches.match_date', season.endDate)

  checkReadError(statsError, 'Lecture des statistiques publiques')

  const {
    matchesPlayed, totalGoals, totalAssists, totalMinutes, totalYellows,
    totalReds, totalMotm, totalWins, favPosition, maxPosCount, totalGA,
    winRate, goalSubtitle, assistsPerMatch, chartData, displayStats,
  } = summarizeSeasonStats(statsData ?? [], season)

  return <div className={s.season}>
    <div className={s.sectionHeading}><span className={s.sectionIndex}>01</span><div><span className={s.eyebrow}>LA SAISON EN CHIFFRES</span><h2>Saison {season.startYear}–{String(season.endYear).slice(-2)}</h2></div><span className={s.contextBadge}>STATISTIQUES DU JOUEUR</span></div>
    <div className={d.primaryStats}>
      <StatCard title="Minutes jouées" value={totalMinutes} subtitle="Du temps sur le terrain." variant="stade" highlight />
      <StatCard title="Matchs Joués" value={matchesPlayed} subtitle={`${totalMinutes} min cumulées`} variant="stade" />
      <StatCard title="Total Buts" value={totalGoals} subtitle={goalSubtitle} variant="stade" />
      <StatCard title="Passes décisives" value={totalAssists} subtitle={`${assistsPerMatch} par match`} variant="stade" />
    </div>
    <div className={`${d.secondaryStats} ${s.secondaryMetrics}`}>
      <StatCard title="G/A (Impliqué)" value={totalGA} subtitle={`${totalGoals} ${totalGoals === 1 ? 'but' : 'buts'} | ${totalAssists} ${totalAssists === 1 ? 'passe décisive' : 'passes décisives'}`} variant="stade" />
      <StatCard title="Ratio Victoires" value={`${winRate}%`} subtitle={`${totalWins} V en ${matchesPlayed} M`} variant="stade" />
      <StatCard title="Homme du Match" value={totalMotm} subtitle="Trophées 🏆" variant="stade" />
      <StatCard title="Poste le plus joué" value={favPosition} subtitle={`${maxPosCount} apparitions`} variant="stade" />
      <StatCard title="Discipline" value={totalYellows + totalReds} subtitle={`${totalYellows} 🟨 | ${totalReds} 🟥`} variant="stade" />
    </div>
    <section className={s.progression} aria-labelledby="public-progression-title"><div className={s.chartIntro}><span className={s.eyebrow}>MATCH APRÈS MATCH</span><h2 id="public-progression-title">Cumul des buts et des passes décisives</h2><p>Le fil offensif de la saison, rencontre après rencontre.</p></div><StatsChart data={chartData} variant="stade" /></section>
    <section className={s.matchHistory} aria-labelledby="public-history-title">
      <div className={s.sectionHeading}><span className={s.sectionIndex}>02</span><div><span className={s.eyebrow}>LES RENCONTRES DE LA SAISON</span><h2 id="public-history-title">Historique des matchs</h2></div><span className={s.contextBadge}>{displayStats.length} rencontres renseignées</span></div>
      {displayStats.length === 0 ? <div className={s.empty}>Aucun match enregistré pour le moment.</div> : <div className={s.matchGrid}>{displayStats.map(stat => <PublicMatchCard key={stat.matches.id} stat={stat} />)}</div>}
      <p className={s.note}>0 est une valeur connue. « — » indique une information non renseignée. Les cartons restent visibles sans participation.</p>
    </section>
    {profileData?.rbfa_team_id && <section className={s.team} aria-label="Équipe du joueur et données RBFA"><div className={s.sectionHeading}><span className={s.sectionIndex}>03</span><div><span className={s.eyebrow}>LE COLLECTIF</span><h2>L’équipe du joueur</h2></div></div><Suspense fallback={<p className={s.empty} role="status">Chargement des informations de l’équipe…</p>}><TeamWidget teamId={profileData?.rbfa_team_id} variant="stade" /></Suspense></section>}
  </div>
}
