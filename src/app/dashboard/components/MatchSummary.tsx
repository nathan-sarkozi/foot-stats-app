import Image from 'next/image'
import Link from 'next/link'
import type { MatchStatRecord } from '@/utils/playerStats'
import { getClubLogo } from '@/utils/getClubLogo'
import s from '../stade.module.css'

const labels: Record<string, string> = { LEAGUE: 'Championnat', CUP: 'Coupe', FRIENDLY: 'Amical' }

export default function MatchSummary({ stat, featured = false }: { stat: MatchStatRecord; featured?: boolean }) {
  const match = stat.matches
  const logo = getClubLogo(match.opponent)
  const date = new Date(`${match.match_date}T12:00:00Z`).toLocaleDateString('fr-BE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
  const knownScore = match.team_score !== null && match.opponent_score !== null
  const result = !knownScore ? 'Score incomplet' : match.team_score! > match.opponent_score!
    ? 'Victoire' : match.team_score! < match.opponent_score! ? 'Défaite' : 'Nul'
  const outcome = !knownScore ? 'unknown' : result === 'Victoire' ? 'win' : result === 'Défaite' ? 'loss' : 'draw'
  const value = (number: number | null) => number === null ? '—' : number

  return <article className={featured ? `${s.panel} ${s.lastMatch}` : s.matchRow} data-match-id={match.id}>
    <div className={s.matchMeta}>
      {featured && <span className={s.eyebrow}>LE DERNIER CHAPITRE</span>}
      <time dateTime={match.match_date}>{date}</time>
      <span className={s.competitionBadge}>{labels[match.competition_type] ?? match.competition_type}</span>
    </div>
    {featured && <div className={s.panelTitle}><h2>Dernier match renseigné</h2><span className={s.resultBadge} data-outcome={outcome}>{result}</span></div>}
    <div className={s.matchMain}>
      <div className={s.clubMark} aria-hidden="true">{logo
        ? <Image src={logo} alt="" fill sizes={featured ? '64px' : '40px'} className={s.clubImage} />
        : <span>{match.opponent.slice(0, 1).toUpperCase()}</span>}</div>
      <div className={s.opponent}><span>{featured ? 'FACE À' : labels[match.competition_type] ?? match.competition_type}</span><h3>{match.opponent}</h3></div>
      <div className={s.matchScore} aria-label={`Score de ton équipe : ${match.team_score ?? 'inconnu'}. Adversaire : ${match.opponent_score ?? 'inconnu'}.`}>
        <strong>{value(match.team_score)}<span>–</span>{value(match.opponent_score)}</strong>
        {featured ? <small>TON ÉQUIPE · ADVERSAIRE</small> : <span className={s.resultBadge} data-outcome={outcome}>{result}</span>}
      </div>
    </div>
    <div className={s.matchPerformance}>
      {stat.has_played === true ? <>
        <span><b>{value(stat.minutes_played)}′</b> minutes</span>
        <span><b>{value(stat.goals)}</b> buts</span>
        <span><b>{value(stat.assists)}</b> passes</span>
        <span><b>{stat.position_played || '—'}</b> poste</span>
      </> : <span className={s.nonParticipant}>{stat.has_played === false ? 'N’a pas joué' : 'Participation non renseignée'}</span>}
    </div>
    <div className={s.matchFoot}>
      <div className={s.matchDiscipline}>
        <span><span aria-hidden="true">🟨</span> {value(stat.yellow_cards)}<span className={s.srOnly}> cartons jaunes</span></span>
        <span><span aria-hidden="true">🟥</span> {value(stat.red_cards)}<span className={s.srOnly}> cartons rouges</span></span>
        <span>{stat.is_motm === true ? '🏆 Homme du Match' : stat.is_motm === null ? 'MOTM : —' : 'MOTM : non'}</span>
      </div>
      <Link href={`/dashboard/edit-match/${match.id}`} className={s.matchLink} aria-label={`Consulter ou modifier le match contre ${match.opponent} du ${date}`}>
        {featured ? 'Ouvrir la feuille de match' : 'Voir / modifier'} <span aria-hidden="true">↗</span>
      </Link>
    </div>
  </article>
}
