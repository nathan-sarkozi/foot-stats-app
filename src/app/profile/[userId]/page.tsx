import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import StatsChart from '@/app/dashboard/components/StatsChart'
import TeamWidget from '@/app/dashboard/components/TeamWidget'
import PublicMatchCard from './components/PublicMatchCard'
import s from './profile.module.css'
import { Suspense } from 'react'
import { getCurrentSeason, summarizeSeasonStats } from '@/utils/playerStats'
import { includeUnreportedMatches, selectSeason } from '@/utils/seasonNavigation'
import { loadSeasonContext } from '@/utils/loadSeasonContext'
import { seasonPresentation } from '@/utils/seasonPresentation'
import SeasonSelector from '@/components/SeasonSelector'
import SeasonCareerContext from '@/components/SeasonCareerContext'
import SeasonStatCards from '@/components/SeasonStatCards'
import CompetitionFilter from '@/app/dashboard/components/CompetitionFilter'
import { checkReadError, resourceIdSchema } from '@/utils/readErrors'

export default async function CurrentSeasonPage(props: { params: Promise<{ userId: string }>, searchParams: Promise<{ season?: string | string[], comps?: string | string[] }> }) {
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

  const searchParams = await props.searchParams
  const currentSeason = getCurrentSeason()
  const context = await loadSeasonContext(supabase, targetUserId)
  const selection = selectSeason(context.matches, context.career, currentSeason, searchParams.season, searchParams.comps)
  const { season, activeComps } = selection
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

  const summary = summarizeSeasonStats(includeUnreportedMatches(selection.seasonMatches, statsData ?? []), season, activeComps)
  const { displayStats } = summary
  const selectedMatches = selection.seasonMatches.filter(match => activeComps.some(comp => comp === match.competition_type))
  const presentation = seasonPresentation(summary, selectedMatches.length)

  return <div className={s.season}>
    <div className={s.sectionHeading}><span className={s.sectionIndex}>01</span><div><span className={s.eyebrow}>LA SAISON EN CHIFFRES</span><h2>Saison {season.startYear}–{String(season.endYear).slice(-2)}</h2></div></div>
    <SeasonSelector seasons={selection.seasons} selected={season} currentYear={currentSeason.startYear} />
    {selection.invalidSeason && <p className={s.note} role="status">Saison indisponible : la saison actuelle est affichée.</p>}
    {selection.resetCompetitions && <p className={s.note} role="status">Les compétitions demandées ne sont pas disponibles : toutes celles de cette saison sont affichées.</p>}
    <SeasonCareerContext entries={selection.careerEntries} href={`/profile/${targetUserId}/career`} />
    <CompetitionFilter variant="stade" available={selection.availableComps} selected={activeComps} />
    <SeasonStatCards summary={summary} known={presentation.known} secondaryClass={s.secondaryMetrics} />
    <p className={s.note}>Statistiques calculées uniquement à partir des matchs enregistrés dans FootStats.{presentation.incomplete && ' Certaines données sont non communiquées : les totaux concernés restent inconnus.'}</p>
    <section className={s.progression} aria-labelledby="public-progression-title"><div className={s.chartIntro}><h2 id="public-progression-title">Cumul des buts et des passes décisives</h2></div><StatsChart data={presentation.chartData} variant="stade" /></section>
    <section className={s.matchHistory} aria-labelledby="public-history-title">
      <div className={s.sectionHeading}><span className={s.sectionIndex}>02</span><div><h2 id="public-history-title">Historique des matchs</h2></div><span className={s.contextBadge}>{displayStats.length} rencontres renseignées</span></div>
      {displayStats.length === 0 ? <div className={s.empty}>Aucun match enregistré dans FootStats pour cette sélection. Cela ne signifie pas qu’aucun match n’a été joué.</div> : <div className={s.matchGrid}>{displayStats.map(stat => <PublicMatchCard key={stat.matches.id} stat={stat} />)}</div>}
      <p className={s.note}>0 est une valeur connue. « — » indique une information non renseignée. Les cartons restent visibles sans participation.</p>
    </section>
    {selection.isCurrent && profileData?.rbfa_team_id && <section className={s.team} aria-label="Équipe du joueur et données RBFA"><div className={s.sectionHeading}><span className={s.sectionIndex}>03</span><div><span className={s.eyebrow}>LE COLLECTIF · SAISON ACTUELLE</span><h2>L’équipe du joueur</h2></div></div><Suspense fallback={<p className={s.empty} role="status">Chargement des informations de l’équipe…</p>}><TeamWidget teamId={profileData?.rbfa_team_id} variant="stade" /></Suspense></section>}
  </div>
}
