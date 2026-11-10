import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import StatsChart from './components/StatsChart'
import CompetitionFilter from './components/CompetitionFilter'
import FormGuide from './components/FormGuide'
import { redirect } from 'next/navigation'
import { getClubLogo } from '@/utils/getClubLogo'
import TeamWidget from './components/TeamWidget'
import { Suspense } from 'react'
import MatchSummary from './components/MatchSummary'
import s from './stade.module.css'
import { getCurrentSeason, summarizeSeasonStats } from '@/utils/playerStats'
import { includeUnreportedMatches, selectSeason } from '@/utils/seasonNavigation'
import { loadSeasonContext } from '@/utils/loadSeasonContext'
import { seasonPresentation } from '@/utils/seasonPresentation'
import SeasonSelector from '@/components/SeasonSelector'
import SeasonCareerContext from '@/components/SeasonCareerContext'
import SeasonStatCards from '@/components/SeasonStatCards'
import PerformanceNavigation from './components/PerformanceNavigation'
import { navigationSourceKey } from '@/utils/navigation'

export default async function DashboardPage(props: { searchParams: Promise<{ comps?: string | string[], season?: string | string[] }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: playerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, rbfa_team_id, club, category, preferred_position, jersey_number, avatar_url')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Dashboard profile read failed', { code: profileError.code })
    return <div className={s.dashboard}><div className={s.error} role="alert">Impossible de charger ton profil. Réessaie dans quelques instants.</div></div>
  }

  const currentSeason = getCurrentSeason()
  const context = await loadSeasonContext(supabase, user.id)
  const selection = selectSeason(context.matches, context.career, currentSeason, searchParams.season, searchParams.comps)
  const { season, activeComps } = selection
  const { data: statsData, error: statsError } = await supabase
    .from('statistics')
    .select(`
      has_played, minutes_played, goals, assists, yellow_cards, red_cards, is_motm, position_played,
      matches!inner (id, match_date, opponent, team_score, opponent_score, competition_type)
    `)
    .eq('player_id', user.id)
    .gte('matches.match_date', season.startDate)
    .lt('matches.match_date', season.endDate)

  if (statsError || !statsData) {
    console.error('Dashboard statistics read failed', { code: statsError?.code ?? 'NO_DATA' })
    return <div className={s.dashboard}><div className={s.error} role="alert">Impossible de charger les statistiques. Réessaie dans quelques instants.</div></div>
  }

  const profile = playerProfile
  const summary = summarizeSeasonStats(includeUnreportedMatches(selection.seasonMatches, statsData), season, activeComps)
  const { matchesPlayed, totalMinutes, displayStats } = summary
  const selectedMatches = selection.seasonMatches.filter(match => activeComps.some(comp => comp === match.competition_type))
  const presentation = seasonPresentation(summary, selectedMatches.length)

  const latest = displayStats[0]
  const clubLogo = getClubLogo(profile.club)
  const seasonLabel = `${season.startYear}–${String(season.endYear).slice(-2)}`

  return (
    <div className={s.dashboard}>
      <PerformanceNavigation userId={user.id} sourceKey={navigationSourceKey('/dashboard', searchParams)} scope={{ currentYear: currentSeason.startYear, seasonYear: season.startYear, seasonYears: selection.seasons.map(option => option.startYear), filteredCompetitions: activeComps.length < selection.availableComps.length ? activeComps : undefined, availableCompetitions: selection.availableComps }} />
      <header className={s.hero}>
        <div className={s.heroCopy}>
          <div className={s.heroEyebrow}><span className={s.seasonPill}>SAISON {seasonLabel}</span></div>
          <h1>Performances<span>.</span></h1>
          <p className={s.heroIntro}><strong>{profile.display_name}</strong></p>
          <div className={s.playerIdentity}>
            <span className={s.playerAvatar}>{profile.avatar_url
              ? <Image src={profile.avatar_url} alt="" fill sizes="38px" className={s.avatarImage} />
              : profile.display_name.slice(0, 2).toUpperCase()}</span>
            <div><strong>{profile.club || 'Sans club renseigné'}</strong><span>{[profile.category, profile.preferred_position].filter(Boolean).join(' · ') || 'Profil à compléter'}</span></div>
          </div>
        </div>
        <div className={s.playerVisual} aria-hidden="true">
          <span className={s.visualLabel}>{profile.club || 'FOOTSTATS'}</span>
          <div className={s.pitchMark} />
          <svg className={s.jersey} viewBox="0 0 210 225" fill="none">
            <path d="m65 20-45 26-15 45 40 16 13-26v127h94V81l13 26 40-16-15-45-45-26-24 14H89Z" fill="#213d35" stroke="#547364" strokeWidth="1.4" />
            <path d="m65 20 24 14h32l24-14-13 31H78Z" fill="#547364" />
            <path d="M94 51h22v157H94Z" fill="#d5ea58" opacity=".85" />
            <path d="m20 46 38 35M190 46l-38 35M58 191h94" stroke="#547364" strokeWidth="2" />
            <rect x="70" y="81" width="70" height="66" rx="6" fill="#213d35" />
            <text x="105" y="132" textAnchor="middle" fill="#eaf1d4" fontSize="54" fontWeight="800" letterSpacing="-3">{profile.jersey_number ?? 'FS'}</text>
          </svg>
          {clubLogo && <span className={s.heroCrest}><Image src={clubLogo} alt="" fill sizes="38px" className={s.clubImage} /></span>}

        </div>
      </header>

      <SeasonSelector seasons={selection.seasons} selected={season} currentYear={currentSeason.startYear} />
      {selection.invalidSeason && <p className={s.unknownNote} role="status">Saison indisponible : la saison actuelle est affichée.</p>}
      {selection.resetCompetitions && <p className={s.unknownNote} role="status">Les compétitions demandées ne sont pas disponibles : toutes celles de cette saison sont affichées.</p>}
      <SeasonCareerContext entries={selection.careerEntries} href="/dashboard/career" />
      <section aria-labelledby="season-stats-title">
        <div className={s.sectionToolbar}>
          <div className={s.sectionHeading}><span className={s.sectionIndex}>01</span><h2 id="season-stats-title">Statistiques</h2></div>
          <Link href="/dashboard/add-match" className={s.primaryButton}><span aria-hidden="true">＋</span> Ajouter un match</Link>
        </div>
        <div className={s.filtersRow}><CompetitionFilter variant="stade" available={selection.availableComps} selected={activeComps} /><span className={s.filterHint}>Compétitions combinables · Saison {seasonLabel}</span></div>
        <SeasonStatCards summary={summary} known={presentation.known} />
        <p className={s.unknownNote}>Statistiques calculées uniquement à partir des matchs enregistrés dans FootStats.{presentation.incomplete && ' Certaines données sont non communiquées : les totaux concernés restent inconnus.'}</p>
      </section>

      <div className={s.mainGrid}>
        {latest ? <MatchSummary stat={latest} featured /> : <section className={`${s.panel} ${s.emptyMatch}`}><h2>{selection.isCurrent ? 'Ta saison commence ici.' : 'Cette saison a une histoire.'}</h2><p>{selection.seasonMatches.length ? 'Aucun match enregistré avec ces filtres.' : 'Aucun match enregistré dans FootStats pour cette saison. Cela ne signifie pas qu’aucun match n’a été joué.'}</p><Link href={selection.isCurrent ? '/dashboard/add-match' : '/dashboard/career'} className={s.textLink}>{selection.isCurrent ? 'Renseigner un match' : 'Consulter la carrière'} <span aria-hidden="true">↗</span></Link></section>}
        <section className={`${s.panel} ${s.chartPanel}`} aria-labelledby="progression-title">
          <div className={s.panelTitle}><div><h2 id="progression-title">Cumul des buts et des passes décisives</h2></div><span className={s.chartSeason}>{seasonLabel}</span></div>
          <p className={s.sectionDescription}>Valeurs cumulées</p>
          <StatsChart data={presentation.chartData} variant="stade" />
          <p className={s.chartNote}>Chaque point représente une rencontre renseignée, avec ou sans participation.</p>
        </section>
      </div>

      <section className={s.seasonStory} aria-labelledby="season-story-title">
        <div className={s.storyMark} aria-hidden="true">↗</div><div><h2 id="season-story-title">À retenir</h2><p><strong>{presentation.known.participation ? matchesPlayed : '—'} participations enregistrées</strong> et <strong>{presentation.known.minutes ? totalMinutes : '—'} minutes renseignées</strong>.</p></div>
        <div className={s.recentForm}><FormGuide recentMatches={displayStats.filter(stat => stat.has_played).map(stat => stat.matches)} variant="stade" /><a href="#match-history" className={s.textLink}>Parcourir mes matchs <span aria-hidden="true">↓</span></a></div>
      </section>

      {selection.isCurrent && <section className={s.teamSection} aria-label="Mon équipe et les informations RBFA">
        <div className={s.sectionHeading}><span className={s.sectionIndex}>02</span><h2>Mon équipe</h2><span className={s.sectionAside}>SAISON ACTUELLE · SOURCE RBFA</span></div>
        <Suspense fallback={<div className={`${s.panel} ${s.loading}`} role="status">Chargement des informations de ton équipe…</div>}>
          <TeamWidget teamId={profile.rbfa_team_id} isDashboard variant="stade" />
        </Suspense>
      </section>}

      <section id="match-history" className={s.history} aria-labelledby="match-history-title">
        <div className={s.sectionToolbar}><div className={s.sectionHeading}><span className={s.sectionIndex}>03</span><h2 id="match-history-title">Historique des matchs ({displayStats.length})</h2></div><a href="#season-stats-title" className={s.textLink}>Revenir aux statistiques ↑</a></div>

        {displayStats.length === 0 ? <div className={s.emptyState}>Aucun match enregistré dans FootStats avec cette sélection.</div> : <div className={s.matchList}>{displayStats.map(stat => <MatchSummary key={stat.matches.id} stat={stat} />)}</div>}
        <p className={s.unknownNote}>0 est une valeur connue. « — » signale une information non renseignée. Les cartons restent affichés même sans participation.</p>
      </section>
      <footer className={s.footer}><strong>footstats<span>.</span></strong><span>SAISON {seasonLabel}</span></footer>
    </div>
  )
}
