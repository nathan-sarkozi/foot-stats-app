import Image from 'next/image'
import { getClubLogo } from '@/utils/getClubLogo'
import type { MatchStatRecord } from '@/utils/playerStats'
import s from '../profile.module.css'

const competitions: Record<string, string> = { LEAGUE: 'Championnat', CUP: 'Coupe', FRIENDLY: 'Amical' }

// Public presentation only: no editing link, action, mutation or private data.
export default function PublicMatchCard({ stat }: { stat: MatchStatRecord }) {
  const match = stat.matches
  const logo = getClubLogo(match.opponent)
  const scoreKnown = match.team_score !== null && match.opponent_score !== null
  const result = !scoreKnown ? 'Score incomplet' : Number(match.team_score) > Number(match.opponent_score) ? 'Victoire' : Number(match.team_score) < Number(match.opponent_score) ? 'Défaite' : 'Nul'
  const outcome = !scoreKnown ? 'unknown' : result === 'Victoire' ? 'win' : result === 'Défaite' ? 'loss' : 'draw'
  const value = (number: number | null) => number === null ? '—' : number

  return <article className={s.matchCard} data-match-id={match.id}>
    <div className={s.matchMeta}><time dateTime={match.match_date}>{new Date(`${match.match_date}T12:00:00Z`).toLocaleDateString('fr-BE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time><span>{competitions[match.competition_type] ?? match.competition_type}</span></div>
    <div className={s.matchIdentity}><span className={s.matchCrest}>{logo ? <Image src={logo} alt="" fill sizes="44px" className={s.crestImage} /> : match.opponent.slice(0, 1)}</span><div><span>FACE À</span><h3>{match.opponent}</h3></div><span className={s.matchResult} data-outcome={outcome}>{result}</span></div>
    <div className={s.matchScore} aria-label={`Équipe du joueur : ${match.team_score ?? 'score inconnu'}. Adversaire : ${match.opponent_score ?? 'score inconnu'}.`}><span>Équipe du joueur</span><strong>{value(match.team_score)}<i>–</i>{value(match.opponent_score)}</strong><span>Adversaire</span></div>
    {stat.has_played === true ? <div className={s.matchPerformance}>
      <span><b>{value(stat.minutes_played)}′</b> minutes</span><span><b>{value(stat.goals)}</b> buts</span><span><b>{value(stat.assists)}</b> {stat.assists === 1 ? 'passe décisive' : 'passes décisives'}</span><span><b>{stat.position_played || '—'}</b> poste</span>
    </div> : <p className={s.participation}>{stat.has_played === false ? 'N’a pas joué' : 'Participation non renseignée'}</p>}
    <div className={s.matchDiscipline}><span><span aria-hidden="true">🟨</span> {value(stat.yellow_cards)}<span className={s.srOnly}> cartons jaunes</span></span><span><span aria-hidden="true">🟥</span> {value(stat.red_cards)}<span className={s.srOnly}> cartons rouges</span></span><span>{stat.is_motm === true ? '🏆 Homme du Match' : stat.is_motm === null ? 'MOTM : —' : 'MOTM : non'}</span></div>
  </article>
}
