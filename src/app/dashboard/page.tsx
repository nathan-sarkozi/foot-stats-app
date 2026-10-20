import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import StatsChart from './components/StatsChart'
import CompetitionFilter from './components/CompetitionFilter'
import StatCard from './components/StatCard'
import FormGuide from './components/FormGuide'
import { redirect } from 'next/navigation'
import { getClubLogo } from '@/utils/getClubLogo'
import TeamWidget from './components/TeamWidget'
import { Suspense } from 'react'
import MatchSummary from './components/MatchSummary'
import s from './stade.module.css'
import { getCurrentSeason, summarizeSeasonStats } from '@/utils/playerStats'
import { parseCompetitionParams } from '@/utils/competitionFilters'

export default async function DashboardPage(props: { searchParams: Promise<{ comps?: string | string[] }> }) {
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

  const season = getCurrentSeason()
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
  const activeComps = parseCompetitionParams(searchParams.comps)
  
  const {
    matchesPlayed, totalGoals, totalAssists, totalMinutes, totalYellows,
    totalReds, totalMotm, totalWins, favPosition, maxPosCount, totalGA,
    winRate, goalSubtitle, assistsPerMatch, chartData, displayStats,
  } = summarizeSeasonStats(statsData, season, activeComps)

  const latest = displayStats[0]
  const clubLogo = getClubLogo(profile.club)
  const seasonLabel = `${season.startYear}–${String(season.endYear).slice(-2)}`

  return (
    <div className={s.dashboard}>
      <header className={s.hero}>
        <div className={s.heroCopy}>
          <div className={s.heroEyebrow}><span className={s.seasonPill}>SAISON {seasonLabel}</span><span>TON FOOTBALL. TA PROGRESSION.</span></div>
          <h1>Ta saison,<br />sur le terrain<span>.</span></h1>
          <p className={s.heroIntro}>Les performances de <strong>{profile.display_name}</strong>, match après match.</p>
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
          <span className={s.visualCaption}>CHAQUE MINUTE COMPTE.</span>
        </div>
      </header>

      <section aria-labelledby="season-stats-title">
        <div className={s.sectionToolbar}>
          <div className={s.sectionHeading}><span className={s.sectionIndex}>01</span><h2 id="season-stats-title">La saison en chiffres</h2></div>
          <Link href="/dashboard/add-match" className={s.primaryButton}><span aria-hidden="true">＋</span> Ajouter un match</Link>
        </div>
        <div className={s.filtersRow}><CompetitionFilter variant="stade" /><span className={s.filterHint}>Compétitions combinables · Saison {seasonLabel}</span></div>
        <div className={s.primaryStats}>
          <StatCard title="Minutes jouées" value={totalMinutes} subtitle="Du temps sur le terrain." variant="stade" highlight />
          <StatCard title="Matchs Joués" value={matchesPlayed} subtitle={`${totalMinutes} min cumulées`} variant="stade" />
          <StatCard title="Total Buts" value={totalGoals} subtitle={goalSubtitle} variant="stade" />
          <StatCard title="Total Passes" value={totalAssists} subtitle={`${assistsPerMatch} par match`} variant="stade" />
        </div>
        <div className={s.secondaryStats}>
          <StatCard title="G/A (Impliqué)" value={totalGA} subtitle={`${totalGoals} B | ${totalAssists} P`} variant="stade" />
          <StatCard title="Ratio Victoires" value={`${winRate}%`} subtitle={`${totalWins} V en ${matchesPlayed} M`} variant="stade" />
          <StatCard title="Homme du Match" value={totalMotm} subtitle="Trophées 🏆" variant="stade" />
          <StatCard title="Poste le plus joué" value={favPosition} subtitle={`${maxPosCount} apparitions`} variant="stade" />
          <StatCard title="Discipline" value={totalYellows + totalReds} subtitle={`${totalYellows} 🟨 | ${totalReds} 🟥`} variant="stade" />
        </div>
      </section>

      <div className={s.mainGrid}>
        {latest ? <MatchSummary stat={latest} featured /> : <section className={`${s.panel} ${s.emptyMatch}`}><span className={s.eyebrow}>LE PREMIER CHAPITRE</span><h2>Ta saison commence ici.</h2><p>Aucun match enregistré avec ces filtres.</p><Link href="/dashboard/add-match" className={s.textLink}>Renseigner un match <span aria-hidden="true">↗</span></Link></section>}
        <section className={`${s.panel} ${s.chartPanel}`} aria-labelledby="progression-title">
          <div className={s.panelTitle}><div><span className={s.eyebrow}>MATCH APRÈS MATCH</span><h2 id="progression-title">Ta saison prend forme.</h2></div><span className={s.chartSeason}>{seasonLabel}</span></div>
          <p className={s.sectionDescription}>Buts et passes décisives cumulés · Impact offensif de la saison</p>
          <StatsChart data={chartData} variant="stade" />
          <p className={s.chartNote}>Chaque point représente une rencontre renseignée, avec ou sans participation.</p>
        </section>
      </div>

      <section className={s.seasonStory} aria-labelledby="season-story-title">
        <div className={s.storyMark} aria-hidden="true">↗</div><div><span className={s.eyebrow}>À RETENIR · SÉLECTION ACTUELLE</span><h2 id="season-story-title">Le fil de ta saison.</h2><p><strong>{matchesPlayed} {matchesPlayed === 1 ? 'participation' : 'participations'}</strong> et <strong>{totalMinutes} minutes</strong> sur le terrain. Retrouve chaque rencontre dans ton historique.</p></div>
        <div className={s.recentForm}><FormGuide recentMatches={displayStats.filter(stat => stat.has_played).map(stat => stat.matches)} variant="stade" /><a href="#match-history" className={s.textLink}>Parcourir mes matchs <span aria-hidden="true">↓</span></a></div>
      </section>

      <section className={s.teamSection} aria-label="Mon équipe et les informations RBFA">
        <div className={s.sectionHeading}><span className={s.sectionIndex}>02</span><h2>Le collectif</h2><span className={s.sectionAside}>DONNÉES RBFA EN CACHE</span></div>
        <Suspense fallback={<div className={`${s.panel} ${s.loading}`} role="status">Chargement des informations de ton équipe…</div>}>
          <TeamWidget teamId={profile.rbfa_team_id} isDashboard variant="stade" />
        </Suspense>
      </section>

      <section id="match-history" className={s.history} aria-labelledby="match-history-title">
        <div className={s.sectionToolbar}><div className={s.sectionHeading}><span className={s.sectionIndex}>03</span><h2 id="match-history-title">Historique des matchs ({displayStats.length})</h2></div><a href="#season-stats-title" className={s.textLink}>Revenir aux statistiques ↑</a></div>
        <p className={s.sectionDescription}>Toutes les rencontres de la sélection. Ouvre une feuille pour consulter ou modifier le match.</p>
        {displayStats.length === 0 ? <div className={s.emptyState}>Aucun match enregistré avec ces filtres.</div> : <div className={s.matchList}>{displayStats.map(stat => <MatchSummary key={stat.matches.id} stat={stat} />)}</div>}
        <p className={s.unknownNote}>0 est une valeur connue. « — » signale une information non renseignée. Les cartons restent affichés même sans participation.</p>
      </section>
      <footer className={s.footer}><strong>footstats<span>.</span></strong><span>Le football que tu vis. La progression que tu suis.</span><span>SAISON {seasonLabel}</span></footer>
    </div>
  )
}
