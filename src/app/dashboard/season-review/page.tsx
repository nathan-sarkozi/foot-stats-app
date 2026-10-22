import Link from 'next/link'
import PerformanceNavigation from '../components/PerformanceNavigation'
import { navigationSourceKey } from '@/utils/navigation'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getCurrentSeason } from '@/utils/playerStats'
import { includeUnreportedMatches, selectSeason, seasonKey } from '@/utils/seasonNavigation'
import { loadSeasonContext } from '@/utils/loadSeasonContext'
import { loadSeasonReviewStats } from '@/utils/loadSeasonReviewStats'
import { buildSeasonReview, compareSeasonReviews } from '@/utils/seasonReview'
import SeasonSelector from '@/components/SeasonSelector'
import SeasonCareerContext from '@/components/SeasonCareerContext'
import CompetitionFilter from '../components/CompetitionFilter'
import SeasonJourney from './SeasonJourney'
import s from './season-review.module.css'

type Review = ReturnType<typeof buildSeasonReview>
type StatRow = Review['rows'][number]
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const seasonLabel = (year: number) => `${year}–${year + 1}`
const display = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2 }).format(value)

function MatchLink({ row }: { row: { id: string, opponent: string, match_date: string } }) {
  return <Link href={`/dashboard/edit-match/${row.id}`} className={s.matchLink}><span><strong>{row.opponent}</strong><time dateTime={row.match_date}>{date(row.match_date)}</time></span><span aria-hidden="true">↗</span></Link>
}

function Moments({ review, recordsHref }: { review: Review, recordsHref: string }) {
  const { records, milestones } = review
  const moments = [
    { id: 'goals', title: 'La plus belle feuille de buts', unit: 'buts sur une rencontre', record: records.onMatch.goals },
    { id: 'contributions', title: 'La rencontre la plus décisive', unit: 'buts + passes décisives', record: records.onMatch.contributions },
  ]
  const run = records.streaks.contributions
  return <section className={s.section} aria-labelledby="moments-title">
    <div className={s.sectionHeading}><div><span className={s.eyebrow}>03 / LES MOMENTS QUI RESTENT</span><h2 id="moments-title">Quelques traces du terrain.</h2></div><Link href={recordsHref} className={s.textLink}>Ouvrir Mes records ↗</Link></div>
    <div className={s.moments}>
      {moments.map(({ id, title, unit, record }) => <article className={s.moment} key={id} data-moment={id}><span className={s.eyebrow}>MAXIMUM CONNU · CETTE SAISON</span><h3>{title}</h3><p className={s.momentValue}>{display(record.value)}<span>{unit}</span></p>
        {record.winners[0] ? <MatchLink row={record.winners[0]} /> : <p className={s.muted}>Aucune participation suffisamment renseignée pour établir ce maximum.</p>}
        {record.winners.length > 1 && <details className={s.details}><summary>{record.winners.length} rencontres ex æquo</summary>{record.winners.map(row => <MatchLink key={row.id} row={row} />)}</details>}
        {record.unknown > 0 && <p className={s.small}>{record.unknown} fiche(s) à compléter peuvent encore changer ce maximum.</p>}
      </article>)}
      <article className={`${s.moment} ${s.runMoment}`} data-moment="streak"><span className={s.eyebrow}>LA CONSTANCE · DANS LA SAISON</span><h3>Une contribution, puis une autre.</h3><p className={s.momentValue}>{display(run.value)}<span>participations consécutives<br />avec un but ou une passe décisive</span></p>
        {run.winners.length ? <details className={s.details}><summary>{run.winners.length > 1 ? `${run.winners.length} séries ex æquo · Voir les rencontres` : 'Retrouver les rencontres de la série'}</summary>{run.winners.map((winner, index) => <div key={index} className={s.run}><p>Du {date(winner.matches[0].match_date)} au {date(winner.matches.at(-1)!.match_date)}</p>{winner.matches.map(row => <MatchLink key={row.id} row={row} />)}</div>)}</details> : <p className={s.muted}>{run.value === 0 ? 'Aucune série positive confirmée dans les participations connues.' : 'Les données ne permettent pas de confirmer une série.'}</p>}
        <p className={s.small}>Non-participations connues ignorées ; données insuffisantes et ordre inconnu d’une même journée interrompent la confirmation.</p>
      </article>
    </div>
    <div className={s.motm}><span className={s.motmIcon} aria-hidden="true">✦</span><div><span className={s.eyebrow}>DISTINCTIONS ENREGISTRÉES</span><h3>{milestones.length} {milestones.length === 1 ? 'distinction Homme du Match confirmée' : 'distinctions Homme du Match confirmées'}</h3><p>{review.metrics.motm === null ? 'Total de saison non communiqué : certaines fiches restent à compléter.' : 'Parmi les participations renseignées de cette sélection.'}</p></div>{milestones.length > 0 && <details className={s.details}><summary>Voir les rencontres</summary>{milestones.map(row => <MatchLink key={row.matches.id} row={row.matches} />)}</details>}</div>
  </section>
}

function Chronology({ review }: { review: Review }) {
  const rows = new Map(review.rows.map(row => [row.matches.id, row]))
  return <details className={s.chronology}><summary>Parcourir la chronologie et les données du graphique <span>{review.rows.length} rencontres</span></summary>
    <div className={s.tableScroll}><table><caption>Rencontres classées par date. Les cumuls deviennent inconnus après une donnée manquante ; les valeurs par match restent consultables.</caption><thead><tr><th scope="col">Rencontre</th><th scope="col">Participation</th><th scope="col">Buts</th><th scope="col">Passes décisives</th><th scope="col">Contributions</th><th scope="col">Cumul buts</th><th scope="col">Cumul passes décisives</th></tr></thead><tbody>{review.timeline.map(point => {
      const row = rows.get(point.id) as StatRow
      return <tr key={point.id}><th scope="row"><MatchLink row={row.matches} /></th><td>{point.participation === null ? 'Non communiquée' : point.participation ? 'Oui' : 'Non · hors terrain'}</td><td>{display(point.goals)}</td><td>{display(point.assists)}</td><td>{display(point.contributions)}</td><td>{display(point.cumGoals)}</td><td>{display(point.cumAssists)}</td></tr>
    })}</tbody></table></div>
  </details>
}

export default async function SeasonReviewPage({ searchParams }: { searchParams: Promise<{ season?: string | string[], comps?: string | string[], compare?: string | string[] }> }) {
  const params = await searchParams
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const current = getCurrentSeason()
  const context = await loadSeasonContext(client, user.id)
  const selection = selectSeason(context.matches, context.career, current, params.season, params.comps)
  const { season, activeComps } = selection
  const options = selection.seasons.filter(option => option.startYear !== season.startYear)
  const defaultComparison = options.find(option => option.startYear < season.startYear) ?? options[0]
  const comparisonSeason = params.compare === undefined ? defaultComparison : options.find(option => seasonKey(option) === params.compare)
  const [statistics, otherStatistics] = await Promise.all([
    loadSeasonReviewStats(client, user.id, season),
    comparisonSeason ? loadSeasonReviewStats(client, user.id, comparisonSeason) : Promise.resolve([]),
  ])
  const review = buildSeasonReview(includeUnreportedMatches(selection.seasonMatches, statistics), season, activeComps, current, user.id)
  const otherSelection = comparisonSeason ? selectSeason(context.matches, context.career, current, seasonKey(comparisonSeason), activeComps) : null
  // Compare the very same competitions; never silently broaden the comparison season.
  const other = comparisonSeason && otherSelection ? buildSeasonReview(includeUnreportedMatches(otherSelection.seasonMatches, otherStatistics), comparisonSeason, activeComps, current, user.id) : null
  const comparison = other ? compareSeasonReviews(review, other) : null
  const competitionQuery = activeComps.length < selection.availableComps.length ? `&comps=${activeComps.join(',')}` : ''
  const dashboardHref = `/dashboard?season=${seasonKey(season)}${competitionQuery}`
  const recordsHref = `/dashboard/records${activeComps.length ? `?comps=${activeComps.join(',')}` : ''}`
  const allBench = review.rows.length > 0 && review.metrics.appearances === 0
  const comparisonPossible = comparison && Object.values(comparison).some(metric => metric.selected !== null && metric.other !== null)
  const metrics = [
    ['Participations', review.metrics.appearances, `${review.rows.length} rencontres enregistrées`],
    ['Buts', review.metrics.goals, 'Dans les participations saisies'],
    ['Passes décisives', review.metrics.assists, 'Le dernier geste avant le but'],
    ['Minutes jouées', review.metrics.minutes, 'Du temps sur le terrain'],
  ] as const
  const comparisons = [
    ['appearances', 'Participations'], ['goals', 'Buts'], ['assists', 'Passes décisives'], ['contributions', 'Contributions décisives'], ['minutes', 'Minutes jouées'], ['motm', 'Homme du Match'], ['contributionsPerAppearance', 'Contributions / participation'],
  ] as const

  return <div className={s.page}>
    <PerformanceNavigation userId={user.id} sourceKey={navigationSourceKey('/dashboard/season-review', params)} scope={{ currentYear: current.startYear, seasonYear: season.startYear, seasonYears: selection.seasons.map(option => option.startYear), filteredCompetitions: activeComps.length < selection.availableComps.length ? activeComps : undefined, availableCompetitions: selection.availableComps, comparisonYear: typeof params.compare === 'string' ? comparisonSeason?.startYear : undefined }} />
    <div className={s.breadcrumb}><Link href={dashboardHref}>← Mon dashboard</Link><span>LE RÉCIT D’UNE SAISON</span></div>
    <header className={s.hero}>
      <div className={s.heroCopy}><span className={s.eyebrow}>FOOTSTATS / MON BILAN DE SAISON</span><h1>Du jeu.<br />Et une <em>trace.</em></h1><p>Ce que racontent les rencontres que tu as enregistrées.</p><span className={s.status}>{review.status === 'current' ? 'EN COURS · BILAN PROVISOIRE' : review.status === 'future' ? 'SAISON À VENIR · DONNÉES SAISIES' : 'SAISON TERMINÉE · MATCHS SAISIS'}</span></div>
      <div className={s.seasonCover}><span>LES CHAPITRES DU TERRAIN</span><strong>{season.startYear}<em>— {String(season.endYear).slice(-2)}</em></strong><div className={s.coverPitch} aria-hidden="true"><span /></div><p>{review.rows.length} rencontres enregistrées<br /><span>1er juillet {season.startYear} → 30 juin {season.endYear}</span></p></div>
    </header>
    <SeasonSelector seasons={selection.seasons} selected={season} currentYear={current.startYear} />
    {selection.invalidSeason && <p role="status" className={s.notice}>Saison indisponible : la saison actuelle est affichée.</p>}
    {selection.resetCompetitions && <p role="status" className={s.notice}>Les compétitions demandées ne sont pas disponibles : toutes celles de cette saison sont affichées.</p>}
    <SeasonCareerContext entries={selection.careerEntries} href="/dashboard/career" />
    <div className={s.scope}><p><strong>Un bilan des matchs saisis, pas une reconstitution de toute ta carrière.</strong> Les saisons manuelles restent séparées. Une donnée inconnue s’affiche « — » ; zéro reste une valeur connue.</p><Link href={recordsHref}>Mes records ↗</Link></div>
    {selection.availableComps.length > 0 && <div className={s.filters}><CompetitionFilter variant="stade" available={selection.availableComps} selected={activeComps} /><span>Le même périmètre s’applique à tout ce bilan.</span></div>}
    {review.rows.length === 0 ? <section className={s.empty}><span className={s.eyebrow}>UNE HISTOIRE À PART ENTIÈRE</span><h2>{selection.careerEntries.length ? 'Cette saison vit dans ta carrière.' : 'Pas de rencontre saisie pour cette saison.'}</h2><p>Aucun match enregistré dans FootStats pour cette sélection. Cela ne signifie pas que tu n’as pas joué. Les informations manuelles ci-dessus ne sont ni transformées en matchs ni utilisées pour fabriquer une courbe ou des records.</p><Link href="/dashboard/career" className={s.secondaryButton}>Retrouver ma carrière ↗</Link></section> : <>
      <section className={s.section} aria-labelledby="overview-title"><div className={s.sectionHeading}><div><span className={s.eyebrow}>01 / LES REPÈRES</span><h2 id="overview-title">Ta saison, en clair.</h2></div><span className={s.sectionAside}>{seasonLabel(season.startYear)}</span></div>
        <div className={s.metrics}>{metrics.map(([label, value, hint]) => <article className={s.metric} key={label} data-review-metric={label}><h3>{label}</h3><strong>{display(value)}</strong><p>{value === null ? 'Total non communiqué' : hint}</p></article>)}</div>
        <div className={s.secondaryMetrics}><p><span>Contributions décisives</span><strong>{display(review.metrics.contributions)}</strong></p><p><span>Homme du Match</span><strong>{display(review.metrics.motm)}</strong></p><p><span>Cartons jaunes</span><strong>{review.presentation.known.discipline ? review.summary.totalYellows : '—'}</strong></p><p><span>Expulsions</span><strong>{review.presentation.known.discipline ? review.summary.totalReds : '—'}</strong></p></div>
        <p className={s.small}>Les cartons incluent les sanctions sans participation. Deux jaunes peuvent correspondre à une expulsion : ces deux indicateurs ne sont pas additionnés.{allBench && ' Aucune participation confirmée dans cette sélection ; les sanctions restent conservées.'}{review.presentation.incomplete && ' Certaines données sont non communiquées : seuls les totaux entièrement connus sont affichés.'}</p>
      </section>
      <section className={s.section} aria-labelledby="journey-title"><div className={s.sectionHeading}><div><span className={s.eyebrow}>02 / LE RYTHME</span><h2 id="journey-title">Rencontre après rencontre.</h2></div><span className={s.chartLegend}><i /> Buts + passes décisives</span></div>
        <div className={s.journeyPanel}><div className={s.chartHeading}><h3>Contributions décisives par rencontre</h3><span>VALEURS PAR MATCH · NON CUMULÉES</span></div><SeasonJourney points={review.timeline} /><p className={s.small}>Une position par rencontre, classée par date ; l’espacement ne représente pas la durée entre les matchs. Les non-participations et les inconnues ne créent pas de faux zéros. Deux rencontres le même jour n’ont pas d’ordre horaire confirmé.</p><Chronology review={review} /></div>
      </section>
      <Moments review={review} recordsHref={recordsHref} />
    </>}
    <section className={s.section} aria-labelledby="comparison-title"><div className={s.sectionHeading}><div><span className={s.eyebrow}>04 / D’UNE SAISON À L’AUTRE</span><h2 id="comparison-title">Deux chapitres, côte à côte.</h2></div><span className={s.sectionAside}>COMPARER SANS SURINTERPRÉTER</span></div>
      <div className={s.comparison}>
        {options.length > 0 ? <form method="get" action="/dashboard/season-review" className={s.compareForm}><input type="hidden" name="season" value={seasonKey(season)} />{params.comps !== undefined && activeComps.length > 0 && <input type="hidden" name="comps" value={activeComps.join(',')} />}<label htmlFor="compare-season">Comparer avec<select id="compare-season" name="compare" defaultValue={comparisonSeason ? seasonKey(comparisonSeason) : ''}>{!comparisonSeason && <option value="" disabled>Choisir une autre saison</option>}{options.map(option => <option key={option.startYear} value={seasonKey(option)}>{seasonKey(option)}{context.matches.some(match => match.match_date >= option.startDate && match.match_date < option.endDate) ? ' · Matchs saisis' : ' · Sans matchs saisis'}</option>)}</select></label><button type="submit" className={s.secondaryButton}>Afficher la comparaison ↗</button></form> : <p className={s.muted}>Une autre saison renseignée sera nécessaire pour ouvrir une comparaison.</p>}
        {params.compare !== undefined && !comparisonSeason && <p className={s.notice} role="status">La saison de comparaison est indisponible ou identique à la saison sélectionnée. Choisis une autre saison.</p>}
        {comparison && comparisonPossible && other ? <><div className={s.tableScroll}><table className={s.compareTable}><caption>Valeurs des matchs enregistrés, pour les mêmes compétitions. « — » : valeur inconnue ou ratio non calculable.</caption><thead><tr><th scope="col">Indicateur</th><th scope="col">{seasonLabel(season.startYear)}{review.status === 'current' && <small>En cours</small>}</th><th scope="col">{seasonLabel(other.season.startYear)}{other.status === 'current' && <small>En cours</small>}</th><th scope="col">Écart de valeurs</th></tr></thead><tbody>{comparisons.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{display(comparison[key].selected)}</td><td>{display(comparison[key].other)}</td><td>{comparison[key].difference === null ? '—' : `${comparison[key].difference > 0 ? '+' : ''}${display(comparison[key].difference)}`}</td></tr>)}</tbody></table></div><p className={s.small}>Ces écarts décrivent les données enregistrées ; ils ne prouvent ni amélioration ni régression. La couverture, le nombre de participations et les compétitions peuvent différer. Le ratio exige des contributions et participations entièrement connues, avec au moins une participation.{(review.status === 'current' || other.status === 'current') && ' Une saison est en cours : son bilan reste provisoire.'}{(review.presentation.incomplete || other.presentation.incomplete) && ' Des fiches incomplètes limitent les indicateurs comparables.'}</p></> : <div className={s.comparisonEmpty}><span aria-hidden="true">↔</span><div><h3>Pas de comparaison chiffrée fiable pour cette sélection.</h3><p>{other && other.rows.length === 0 ? 'Cette autre saison ne contient pas de matchs saisis dans les compétitions sélectionnées. Les éventuelles statistiques manuelles de carrière, connues ou non communiquées, restent séparées.' : 'Les participations et statistiques nécessaires ne sont pas assez renseignées des deux côtés. Aucune différence n’est inventée.'}</p></div></div>}
      </div>
    </section>
    <footer className={s.footer}><strong>footstats<span>.</span></strong><p>Le terrain écrit l’histoire.<br />Toi, tu en gardes la trace.</p><Link href={dashboardHref}>Revenir à mon dashboard ↗</Link></footer>
  </div>
}
