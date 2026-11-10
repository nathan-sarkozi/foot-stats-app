import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { getClubLogo } from '@/utils/getClubLogo'
import { getCurrentSeason, summarizeSeasonStats } from '@/utils/playerStats'
import { checkReadError, resourceIdSchema } from '@/utils/readErrors'
import type { Tables } from '@/types/supabase'
import s from './career.module.css'

type CareerEntry = Pick<Tables<'career_entries'>,
  | 'id' | 'season_start' | 'season_end' | 'is_free_agent' | 'club'
  | 'category' | 'is_youth' | 'is_verified' | 'has_stats' | 'matches_played'
  | 'goals' | 'assists' | 'yellow_cards' | 'red_cards'
> & {
  is_current?: boolean
}

export default async function CareerPage(props: { params: Promise<{ userId: string }> }) {
  const targetUserId = (await props.params).userId
  if (!resourceIdSchema.safeParse(targetUserId).success) return notFound()
  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase.from('profiles').select('club, category').eq('id', targetUserId).maybeSingle()

  checkReadError(profileError, 'Lecture du profil de carrière')
  if (!profile) return notFound()
  
  const { data: careerData, error } = await supabase
    .from('career_entries')
    .select('*')
    .eq('player_id', targetUserId)
    .order('season_end', { ascending: false })

  checkReadError(error, 'Lecture de la carrière publique')
  const careerEntries = careerData ?? []

  const season = getCurrentSeason()
  const { data: currentStats, error: statsError } = await supabase
    .from('statistics')
    .select('has_played, minutes_played, goals, assists, yellow_cards, red_cards, is_motm, position_played, matches!inner(id, match_date, opponent, team_score, opponent_score, competition_type)')
    .eq('player_id', targetUserId)
    .gte('matches.match_date', season.startDate)
    .lt('matches.match_date', season.endDate)

  if (statsError) {
    console.error('Lecture des statistiques de carrière', {
      code: statsError.code,
      message: statsError.message,
    })
  }

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

  if (!careerEntries.find(c => c.season_start === season.startYear)) {
    if (isYouthCategory) youthCareer.push(currentEntry)
    else seniorCareer.push(currentEntry)
  }

  for (const entry of careerEntries) {
    if (entry.is_youth) youthCareer.push(entry)
    else seniorCareer.push(entry)
  }

  const renderTimeline = (entries: CareerEntry[], title: string) => {
    if (entries.length === 0) return null
    return <section className={s.chapter} aria-label={title}>
      <div className={s.chapterHeading}><span aria-hidden="true">{title === 'Carrière Senior' ? '01' : '02'}</span><h3>{title}</h3><small>{entries.length} {entries.length === 1 ? 'saison' : 'saisons'}</small></div>
      <ol className={s.timeline}>{entries.map(entry => {
        const seasonLabel = `${entry.season_start.toString().slice(-2)}/${entry.season_end.toString().slice(-2)}`
        const logo = getClubLogo(entry.club)
        return <li key={entry.id} className={s.timelineRow} data-current={entry.is_current || undefined}>
          <div className={s.seasonStamp}><span>SAISON</span><strong title={`${entry.season_start}–${entry.season_end}`}>{seasonLabel}</strong><small>{entry.season_start} — {entry.season_end}</small>{entry.is_current && <span className={s.current}>En cours</span>}</div>
          <div className={s.seasonCard}>
            <div className={s.clubHeading}><span className={s.logo}>{!entry.is_free_agent && logo ? <Image src={logo} alt={entry.club!} fill className={s.logoImage} sizes="52px" /> : <span aria-hidden="true">{entry.is_free_agent ? '—' : entry.club?.slice(0, 1) || '?'}</span>}</span><div><span className={s.source}>{entry.is_current ? 'SAISON CALCULÉE · DONNÉES DES MATCHS' : 'SAISON RENSEIGNÉE'}</span><h4>{entry.is_free_agent ? 'Sans club' : entry.club || 'Club non renseigné'}{!entry.is_free_agent && entry.is_verified && <span className={s.verified} role="img" aria-label="Club vérifié" title="Vérifié">✓</span>}</h4>{!entry.is_free_agent && entry.category && <p>{entry.category}</p>}</div><span className={s.category}>{entry.is_youth ? 'JEUNES' : 'SENIORS'}</span></div>
            {entry.is_free_agent ? <p className={s.freeAgent}>Période sans club renseignée.</p> : entry.has_stats ? <dl className={s.stats}>
              <div><dt>Matchs</dt><dd><span>{entry.matches_played ?? '—'}</span></dd></div><div><dt>Buts</dt><dd><span>{entry.goals ?? '—'}</span></dd></div><div><dt><abbr title="Passes décisives" aria-label="Passes décisives">Passes déc.</abbr></dt><dd><span title="Passes décisives">{entry.assists ?? '—'}<span className="sr-only"> {entry.assists === 1 ? 'passe décisive' : 'passes décisives'}</span></span></dd></div><div><dt>Jaunes</dt><dd><span>{entry.yellow_cards ?? '—'}</span></dd></div><div><dt>Rouges</dt><dd><span>{entry.red_cards ?? '—'}</span></dd></div>
            </dl> : <div className={s.unknown}><span aria-hidden="true">—</span><p>Statistiques <strong>Non communiquées</strong></p></div>}
          </div>
        </li>
      })}</ol>
    </section>
  }

  return <div className={s.career}>
    <header className={s.intro}><div><h2>Carrière</h2></div><span className={s.introMark} aria-hidden="true">↗</span></header>
    {statsError && <p role="alert" className={s.error}>Impossible de charger les statistiques de la saison actuelle. Réessayez plus tard.</p>}
    {seniorCareer.length === 0 && youthCareer.length === 0 ? <div className={s.empty}>Pas de données historiques disponibles pour ce joueur.</div> : <>{renderTimeline(seniorCareer, 'Carrière Senior')}{renderTimeline(youthCareer, 'Parcours Jeune')}</>}
    <p className={s.note}>Les saisons renseignées sont conservées en priorité. « — » signifie non renseigné ; 0 indique une valeur connue.</p>
  </div>
}
