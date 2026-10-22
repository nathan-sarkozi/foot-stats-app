import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getCurrentSeason } from '@/utils/playerStats'
import { includeUnreportedMatches, selectSeason, seasonKey } from '@/utils/seasonNavigation'
import { loadSeasonContext } from '@/utils/loadSeasonContext'
import { loadSeasonReviewStats } from '@/utils/loadSeasonReviewStats'
import { buildSeasonReview } from '@/utils/seasonReview'
import { COMPETITIONS } from '@/utils/competitionFilters'
import { loadSeasonGoals } from '@/utils/loadSeasonGoals'
import { GOAL_METRICS, buildGoalProgression } from '@/utils/seasonGoals'
import SeasonSelector from '@/components/SeasonSelector'
import GoalCard from './GoalCard'
import GoalForm from './GoalForm'
import s from './goals.module.css'
import PerformanceNavigation from '../components/PerformanceNavigation'
import { navigationSourceKey } from '@/utils/navigation'

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ season?: string | string[] }> }) {
  const params = await searchParams
  const client = await createClient()
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError) { console.error('Season goals session failed', { code: authError.code }); throw new Error('Impossible de vérifier ta connexion. Réessaie dans quelques instants.') }
  if (!user) redirect('/login')
  const current = getCurrentSeason()
  const [context, goals] = await Promise.all([loadSeasonContext(client, user.id), loadSeasonGoals(client, user.id)])
  const selection = selectSeason(context.matches, context.career, current, params.season, undefined, goals.map(goal => goal.season_start))
  const { season } = selection
  const statistics = await loadSeasonReviewStats(client, user.id, season)
  const review = buildSeasonReview(includeUnreportedMatches(selection.seasonMatches, statistics), season, COMPETITIONS, current, user.id)
  const cards = goals.filter(goal => goal.season_start === season.startYear).map(goal => {
    const metric = GOAL_METRICS.find(value => value === goal.metric)
    if (!metric) throw new Error('Un objectif contient un indicateur non reconnu. Réessaie après vérification de ses données.')
    return { goal, metric, progress: buildGoalProgression(review, metric, goal.target) }
  }).sort((a, b) => GOAL_METRICS.indexOf(a.metric) - GOAL_METRICS.indexOf(b.metric))
  const selected = cards.map(card => card.goal)
  const available = GOAL_METRICS.filter(metric => !selected.some(goal => goal.metric === metric))
  const completed = cards.filter(({ progress }) => progress.status === 'achieved' || progress.status === 'exceeded').length
  const hasDashboardSeason = selection.isCurrent || selection.seasonMatches.length > 0 || selection.careerEntries.length > 0
  const dashboardHref = hasDashboardSeason ? `/dashboard?season=${seasonKey(season)}` : '/dashboard'

  return <div className={s.page}>
    <PerformanceNavigation userId={user.id} sourceKey={navigationSourceKey('/dashboard/goals', params)} scope={{ currentYear: current.startYear, seasonYear: season.startYear, seasonYears: selection.seasons.map(option => option.startYear), regularSeasonYears: selectSeason(context.matches, context.career, current, undefined, undefined).seasons.map(option => option.startYear) }} />
    <div className={s.breadcrumb}><Link href={dashboardHref}>← Mon dashboard</Link><span className={s.private}><svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" /><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" /></svg>OBJECTIFS PRIVÉS</span></div>
    <header className={s.hero}><div className={s.heroCopy}><span className={s.eyebrow}>FOOTSTATS / MES OBJECTIFS</span><h1>Ta saison.<br />Tes <em>repères.</em></h1><p>Des cibles qui t’appartiennent.<br />Une progression qui se lit sur le terrain.</p><span className={s.seasonBadge}>{season.startYear}–{season.endYear} · {selection.isCurrent ? 'SAISON EN COURS' : season.startYear < current.startYear ? 'SAISON TERMINÉE' : 'SAISON À VENIR'}</span></div>
      <div className={s.seasonMark}><div className={s.markHeading}><span>UN CAP PERSONNEL</span><span aria-hidden="true">↗</span></div><div className={s.markNumber}>{String(selected.length).padStart(2, '0')}<span>/ 04</span></div><div className={s.markSteps} aria-hidden="true">{[0, 1, 2, 3].map(index => <span key={index} data-complete={index < completed} data-defined={index < selected.length} />)}</div><p>{selected.length ? `${completed} ${completed === 1 ? 'cible atteinte' : 'cibles atteintes'} sur ${selected.length} ${selected.length === 1 ? 'objectif défini' : 'objectifs définis'}` : 'Le premier repère reste à définir.'}</p><span className={s.markNote}>À TON RYTHME. À TA MESURE.</span></div>
    </header>
    <SeasonSelector seasons={selection.seasons} selected={season} currentYear={current.startYear} hint="Chaque saison conserve ses objectifs. Toutes compétitions confondues." />
    {selection.invalidSeason && <p className={s.notice} role="status">Saison indisponible : la saison actuelle est affichée.</p>}
    <div className={s.scope}><div><span className={s.scopeTag}>TOUTES COMPÉTITIONS</span><p>Progression calculée uniquement depuis tes matchs saisis. Les filtres du dashboard ne changent pas ces objectifs ; les informations manuelles de carrière restent séparées.</p></div><span>{review.rows.length} {review.rows.length === 1 ? 'rencontre saisie' : 'rencontres saisies'}</span></div>
    {selected.length ? <section className={s.cards} aria-label="Mes objectifs de saison">{cards.map(({ goal, metric, progress }, index) => <GoalCard key={goal.id} goal={goal} metric={metric} progress={progress} index={index} />)}</section> : <section className={s.empty}><div className={s.emptyMark} aria-hidden="true">◎</div><div><span className={s.eyebrow}>LE CAP T’APPARTIENT</span><h2>Qu’aimerais-tu viser cette saison ?</h2><p>Un nombre de participations. Quelques gestes décisifs. Choisis ce qui a du sens pour toi, sans transformer chaque match en obligation.</p><a href="#create-goal" className={s.textLink}>Définir mon premier objectif ↓</a></div></section>}
    <section id="create-goal" className={s.createSection} aria-labelledby="create-title"><div className={s.createCopy}><span className={s.eyebrow}>DES CIBLES AJUSTABLES</span><h2 id="create-title">Un repère.<br />Pas une pression.</h2><p>Un objectif par indicateur, jusqu’à quatre par saison. Tu peux ajuster une cible ou la supprimer à tout moment, même pour une saison passée.</p><p>Aucune reconduction automatique. Modifier un objectif ne change jamais tes matchs ni tes statistiques.</p></div><div className={s.createPanel}>{available.length ? <><h3>Définir un objectif</h3><p className={s.small}>Saison {season.startYear}–{season.endYear} · Visible uniquement par toi.</p><GoalForm key={`${season.startYear}:${available.join(',')}`} seasonStart={season.startYear} metrics={available} /></> : <div className={s.allDefined}><span aria-hidden="true">✓</span><h3>Tes quatre repères sont définis.</h3><p>Tu peux ajuster chaque cible depuis sa carte. Le terrain fera le reste, rencontre après rencontre.</p></div>}</div></section>
    <details className={s.rules}><summary>Comment lire ma progression ?</summary><p>Les participations reposent sur « J’ai participé », jamais sur une déduction des minutes. Les buts, passes décisives et distinctions MOTM des non-participants ne sont pas comptabilisés.</p><p>Une valeur connue peut être zéro. Une fiche absente ou une donnée inconnue reste inconnue. « Au moins » indique un minimum confirmé ; il ne représente pas un total exact. La complétude est indépendante pour chaque indicateur.</p><p>Corriger ou supprimer un match peut faire diminuer la progression. Une cible atteinte n’est pas un badge permanent : elle reflète les données actuellement saisies. Les objectifs des saisons sans match restent conservés, sans progression inventée.</p></details>
    <footer className={s.footer}><strong>footstats<span>.</span></strong><p>Le cap est personnel.<br />La trace reste la tienne.</p><Link href={dashboardHref}>Revenir à mon dashboard ↗</Link></footer>
  </div>
}
