import Link from 'next/link'
import PerformanceNavigation from '../components/PerformanceNavigation'
import { navigationSourceKey } from '@/utils/navigation'
import { getCurrentSeason } from '@/utils/playerStats'
import { seasonYearForDate } from '@/utils/seasonNavigation'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { loadPersonalRecords } from '@/utils/loadPersonalRecords'
import { buildPersonalRecords, type RecordMatch, type MatchRecord, type StreakRecord, type SeasonRecord } from '@/utils/personalRecords'
import { COMPETITIONS, parseCompetitionParams } from '@/utils/competitionFilters'
import CompetitionFilter from '../components/CompetitionFilter'
import s from './records.module.css'

const labels = { LEAGUE: 'Championnat', CUP: 'Coupe', FRIENDLY: 'Amical' }
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const seasonLabel = (year: number) => `${year}–${year + 1}`
const singularUnits: Record<string, string> = { buts: 'but', 'passes décisives': 'passe décisive', participations: 'participation' }
const unitLabel = (value: number | null, unit: string) => value === 1 ? singularUnits[unit] ?? unit : unit

function MatchLink({ match }: { match: RecordMatch }) {
  return <Link href={`/dashboard/edit-match/${match.id}`} className={s.matchLink}><span><strong>{match.opponent}</strong><time dateTime={match.match_date}>{date(match.match_date)}</time></span><span aria-hidden="true">↗</span></Link>
}

function MatchRecordCard({ id, title, unit, record, featured = false }: { id: string, title: string, unit: string, record: MatchRecord, featured?: boolean }) {
  return <article className={`${s.matchCard} ${featured ? s.featured : ''}`} aria-labelledby={`record-${id}`} data-record={id}>
    <div className={s.cardHeading}><span>EN UNE RENCONTRE</span><span aria-hidden="true">↗</span></div>
    <h3 id={`record-${id}`}>{title}</h3>
    <p className={s.result}><strong data-record-value="">{record.value ?? '—'}</strong><span>{unitLabel(record.value, unit)}</span></p>
    {record.winners[0] ? <MatchLink match={record.winners[0]} /> : <p className={s.unavailable}>{record.unknown ? 'Statistiques non communiquées pour les rencontres concernées.' : 'Aucune participation renseignée pour établir ce record.'}</p>}
    {record.winners.length > 1 && <details className={s.ties}><summary>{record.winners.length} performances ex æquo · Voir les rencontres</summary><ul>{record.winners.map(match => <li key={match.id}><MatchLink match={match} /></li>)}</ul></details>}
    <p className={s.coverage}>{record.known} {record.known === 1 ? 'participation renseignée' : 'participations renseignées'}{record.unknown > 0 && ` · ${record.unknown} à compléter`}{record.value === 0 && ' · Maximum connu : zéro'}</p>
  </article>
}

function StreakCard({ id, title, record }: { id: string, title: string, record: StreakRecord }) {
  const first = record.winners[0]
  return <article className={s.streakCard} data-record={id}>
    <div className={s.streakTop}><div><span className={s.eyebrow}>PARTICIPATIONS CONSÉCUTIVES</span><h3>{title}</h3></div><p className={s.streakValue}><strong data-record-value="">{record.value ?? '—'}</strong><span>{record.value === 1 ? 'participation' : 'participations'}</span></p></div>
    <div className={s.streakTrack} aria-hidden="true"><span /></div>
    {first ? <><p className={s.runDates}>Du {date(first.matches[0].match_date)} au {date(first.matches.at(-1)!.match_date)}<span>Saison {seasonLabel(first.season)}</span></p><MatchLink match={first.matches.at(-1)!} /></> : <p className={s.unavailable}>{record.value === 0 ? 'Aucune série positive confirmée parmi les participations renseignées.' : 'Pas assez de données fiables pour confirmer une série.'}</p>}
    {record.winners.length > 0 && <details className={s.ties}><summary>{record.winners.length > 1 ? `${record.winners.length} séries ex æquo · Voir les parcours` : 'Voir les rencontres de la série'}</summary>{record.winners.map((run, index) => <div className={s.run} key={`${run.matches[0].id}-${index}`}><p>Saison {seasonLabel(run.season)} · {run.matches.length} {run.matches.length === 1 ? 'participation' : 'participations'}</p><ol>{run.matches.map(match => <li key={match.id}><MatchLink match={match} /></li>)}</ol></div>)}</details>}
    <p className={s.coverage}>{record.unknown > 0 ? `${record.unknown} rencontre(s) interrompent la confirmation faute de données.` : 'Calculée sur les participations connues.'}{record.ambiguousDays > 0 && ` ${record.ambiguousDays} journée(s) à plusieurs rencontres écartées, faute d’horaire.`}</p>
  </article>
}

function SeasonRecordRow({ id, title, unit, record, competitionQuery }: { id: string, title: string, unit: string, record: SeasonRecord, competitionQuery: string }) {
  const href = (year: number) => `/dashboard?season=${year}-${year + 1}${competitionQuery}`
  return <article className={s.seasonRow} data-record={id}>
    <div className={s.seasonMetric}><h3>{title}</h3><p>{record.known} {record.known === 1 ? 'saison comparable' : 'saisons comparables'}{record.unknown > 0 && ` · ${record.unknown} incomplète(s) hors classement`}</p></div>
    <div className={s.seasonValue}><strong data-record-value="">{record.value ?? '—'}</strong><span>{unitLabel(record.value, unit)}</span></div>
    <div className={s.seasonContext}>{record.winners[0] !== undefined ? <Link href={href(record.winners[0])}>Saison {seasonLabel(record.winners[0])} <span aria-hidden="true">↗</span></Link> : <span>Non communiqué</span>}
      {record.winners.length > 1 && <details className={s.ties}><summary>{record.winners.length} saisons ex æquo</summary><ul>{record.winners.map(year => <li key={year}><Link href={href(year)}>Saison {seasonLabel(year)} ↗</Link></li>)}</ul></details>}
    </div>
  </article>
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ comps?: string | string[] }> }) {
  const params = await searchParams
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const rows = await loadPersonalRecords(client, user.id)
  const all = buildPersonalRecords(rows, user.id)
  const available = COMPETITIONS.filter(comp => all.matches.some(match => match.competition_type === comp))
  const selected = parseCompetitionParams(params.comps).filter(comp => available.includes(comp))
  const active = selected.length ? selected : available
  const records = params.comps === undefined ? all : buildPersonalRecords(rows, user.id, active)
  const competitionQuery = active.length < available.length ? `&comps=${active.join(',')}` : ''
  const currentYear = getCurrentSeason().startYear

  return <div className={s.page}>
    <PerformanceNavigation userId={user.id} sourceKey={navigationSourceKey('/dashboard/records', params)} scope={{ currentYear, seasonYears: [currentYear], filteredCompetitions: active.length < available.length ? active : undefined, availableCompetitions: COMPETITIONS.filter(comp => all.matches.some(match => seasonYearForDate(match.match_date) === currentYear && match.competition_type === comp)) }} />
    <header className={s.hero}>
      <div className={s.heroCopy}><span className={s.eyebrow}>FOOTSTATS / LE LIVRE PERSONNEL</span><h1>Mes records<span>.</span><br /><em>Mon empreinte.</em></h1><p>Les matchs passent. Certaines performances restent.</p><div className={s.scope}><span>{records.matches.length} {records.matches.length === 1 ? 'rencontre saisie' : 'rencontres saisies'}</span><span>{records.appearances} {records.appearances === 1 ? 'participation confirmée' : 'participations confirmées'}</span><span>{records.seasonCount} {records.seasonCount === 1 ? 'saison documentée' : 'saisons documentées'}</span></div></div>
      <div className={s.heroArt} aria-hidden="true"><span>CHAQUE MATCH LAISSE UNE TRACE</span><svg viewBox="0 0 240 230" fill="none"><circle cx="120" cy="105" r="85" stroke="currentColor" opacity=".16" /><circle cx="120" cy="105" r="65" stroke="currentColor" opacity=".12" strokeDasharray="2 7" /><path d="M80 53h80v34c0 34-18 50-40 50S80 121 80 87V53ZM80 65H57v18c0 24 14 34 32 34m71-52h23v18c0 24-14 34-32 34m-31 20v32m-23 0h46v20H97v-20Z" stroke="currentColor" strokeWidth="2" /><path d="m120 73 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2 5-10Z" fill="currentColor" opacity=".9" /><path d="M65 207h110" stroke="currentColor" opacity=".45" /></svg><span>LE FOOTBALL QUE TU VIS.</span></div>
    </header>
    <div className={s.context}><p><strong>Records observés sur les matchs enregistrés dans FootStats.</strong> Ils ne représentent pas nécessairement les records absolus de toute ta carrière. Les statistiques manuelles de carrière ne sont jamais additionnées ici.</p><Link href="/dashboard/career">Retrouver ma carrière ↗</Link></div>
    {all.matches.length === 0 ? <section className={s.empty}><span className={s.eyebrow}>LE LIVRE EST OUVERT</span><h2>Le premier chapitre reste à écrire.</h2><p>Aucun match enregistré dans FootStats pour le moment. Cela ne signifie pas que tu n’as jamais joué. Tes saisons historiques restent dans ta carrière.</p><Link href="/dashboard/add-match" className={s.primaryButton}>Renseigner un match ↗</Link></section> : <>
      <div className={s.toolbar}><CompetitionFilter variant="stade" available={available} selected={active} /><span>Toutes les saisons · {active.map(comp => labels[comp]).join(' + ')}</span></div>
      {params.comps !== undefined && !selected.length && <p className={s.notice} role="status">Les compétitions demandées ne sont pas disponibles : toutes les compétitions enregistrées sont affichées.</p>}
      {all.invalidDates > 0 && <p className={s.notice}>Certaines dates ne permettent pas de classer les rencontres. Elles restent hors de ce livre des records.</p>}
      <nav className={s.chapters} aria-label="Chapitres du livre des records"><a href="#match-records">01 <span>Sur un match</span></a><a href="#streak-records">02 <span>Les séries</span></a><a href="#season-records">03 <span>Les saisons</span></a></nav>
      <section id="match-records" className={s.chapter} aria-labelledby="match-records-title"><div className={s.sectionHeading}><div><span className={s.eyebrow}>01 / LA PERFORMANCE</span><h2 id="match-records-title">Un match. Une marque.</h2></div><p>Maximum connu par participation enregistrée.</p></div>
        <div className={s.matchGrid}><MatchRecordCard id="goals" title="Buts sur un match" unit="buts" record={records.onMatch.goals} featured /><MatchRecordCard id="assists" title="Passes décisives sur un match" unit="passes décisives" record={records.onMatch.assists} /><MatchRecordCard id="contributions" title="Contributions décisives" unit="buts + passes décisives" record={records.onMatch.contributions} /></div>
        <p className={s.sectionNote}>Les valeurs inconnues ne valent jamais zéro. Les maxima portent sur les valeurs connues ; les fiches à compléter peuvent encore changer ces records. En cas d’ex æquo, la première occurrence est mise en avant et toutes restent consultables.</p>
      </section>
      <section id="streak-records" className={s.chapter} aria-labelledby="streak-records-title"><div className={s.sectionHeading}><div><span className={s.eyebrow}>02 / LA CONSTANCE</span><h2 id="streak-records-title">Quand le fil se tend.</h2></div><p>La plus longue suite confirmée, dans une même saison.</p></div>
        <div className={s.streakGrid}><StreakCard id="goal-streak" title="Avec au moins un but" record={records.streaks.goals} /><StreakCard id="contribution-streak" title="Avec une contribution décisive" record={records.streaks.contributions} /></div>
        <details className={s.rules}><summary>Comment les séries sont-elles calculées ?</summary><p>Nous suivons l’ordre des dates des participations enregistrées dans les compétitions sélectionnées. Une non-participation connue est ignorée : elle n’allonge ni n’interrompt la série. Une participation inconnue, une fiche manquante ou une donnée qui ne permet pas de confirmer la performance coupe la série. Un but ou une passe connue suffit à confirmer une contribution, même si l’autre valeur manque.</p><p>Les séries s’arrêtent à la frontière juin/juillet. Les journées avec plusieurs rencontres concernées sont écartées, faute d’ordre de coup d’envoi. Les rencontres non saisies et celles d’autres compétitions ne sont pas connues de cette série.</p></details>
      </section>
      <section id="season-records" className={s.chapter} aria-labelledby="season-records-title"><div className={s.sectionHeading}><div><span className={s.eyebrow}>03 / LES CHAPITRES FORTS</span><h2 id="season-records-title">Les saisons qui se distinguent.</h2></div><p>Du 1er juillet au 30 juin. À partir des matchs saisis.</p></div>
        <div className={s.seasonBook}><SeasonRecordRow id="season-goals" title="Buts enregistrés sur une saison" unit="buts" record={records.seasons.goals} competitionQuery={competitionQuery} /><SeasonRecordRow id="season-assists" title="Passes décisives sur une saison" unit="passes décisives" record={records.seasons.assists} competitionQuery={competitionQuery} /><SeasonRecordRow id="season-appearances" title="Participations sur une saison" unit="participations" record={records.seasons.appearances} competitionQuery={competitionQuery} /><SeasonRecordRow id="season-motm" title="Distinctions Homme du Match" unit="MOTM" record={records.seasons.motm} competitionQuery={competitionQuery} /></div>
        <p className={s.sectionNote}>Pour chaque indicateur, seules les saisons dont toutes les données nécessaires sont renseignées sont comparées. Les saisons incomplètes restent hors classement pour cet indicateur. Une saison en cours peut encore évoluer ; une saison uniquement manuelle ne figure pas ici.</p>
      </section>
    </>}
    <footer className={s.footer}><strong>footstats<span>.</span></strong><span>Les chiffres racontent. Le terrain décide.</span><Link href="/dashboard">Retour à ma saison ↑</Link></footer>
  </div>
}
