import type { Tables } from '@/types/supabase'
import clubsData from '@/data/belgian_clubs.json'
import DisciplineFields from './DisciplineFields'
import ui from '@/components/stadium.module.css'
import s from '../match-editor.module.css'

type MatchValues = Pick<Tables<'matches'>, 'match_date' | 'opponent' | 'competition_type' | 'team_score' | 'opponent_score'>
type StatisticValues = Pick<Tables<'statistics'>, 'has_played' | 'minutes_played' | 'position_played' | 'goals' | 'assists' | 'is_motm' | 'yellow_cards' | 'red_cards'>

const positions = [
  ['BU', 'Buteur'], ['AG', 'Ailier Gauche'], ['AD', 'Ailier Droit'],
  ['MOC', 'Milieu Offensif'], ['MC', 'Milieu Central'], ['MDC', 'Milieu Défensif'],
  ['DG', 'Défenseur Gauche'], ['DD', 'Défenseur Droit'], ['DC', 'Défenseur Central'], ['GB', 'Gardien'],
]

// Server-rendered fields shared by creation and editing. Submission and validation
// stay in the existing ActionForm and Server Actions; no client data fetching.
export default function MatchFields({ match, stat }: { match?: MatchValues; stat?: StatisticValues }) {
  const hasUnknownValues = [match?.team_score, match?.opponent_score, stat?.has_played, stat?.is_motm,
    stat?.minutes_played, stat?.goals, stat?.assists, stat?.yellow_cards, stat?.red_cards].some(value => value === null)
  const unknown = (field: 'minutes_played' | 'goals' | 'assists' | 'yellow_cards' | 'red_cards') => stat?.[field] === null
  const hint = (field: 'minutes_played' | 'goals' | 'assists' | 'yellow_cards' | 'red_cards') => unknown(field)
    ? <p id={`${field}-hint`} className={s.hint}>Valeur historique non renseignée. Saisis une valeur connue, 0 si aucune.</p> : null
  const describedBy = (field: 'minutes_played' | 'goals' | 'assists' | 'yellow_cards' | 'red_cards') => unknown(field) ? `${field}-hint` : undefined

  return <div className={s.fields}>
    {hasUnknownValues && <p className={s.historicalNotice}>Certaines valeurs historiques ne sont pas renseignées. Complète-les explicitement pour enregistrer cette rencontre. Zéro signifie une absence connue, pas une information inconnue.</p>}
    <section className={`${s.panel} ${s.encounter}`} aria-labelledby="encounter-title">
      <div className={s.sectionHeading}><span className={s.sectionNumber}>01</span><div><h2 id="encounter-title">La rencontre</h2><p>Le contexte, l’adversaire, le résultat.</p></div><span className={s.sectionMark} aria-hidden="true">↗</span></div>
      <div className={s.encounterFields}>
        <div><label htmlFor="match_date" className={ui.label}>Date du match <span className={s.required}>*</span></label><input type="date" id="match_date" name="match_date" required defaultValue={match?.match_date} className={ui.field} /></div>
        <div><label htmlFor="competition_type" className={ui.label}>Compétition <span className={s.required}>*</span></label><select id="competition_type" name="competition_type" required defaultValue={match?.competition_type ?? 'LEAGUE'} className={ui.field}><option value="LEAGUE">Championnat</option><option value="CUP">Coupe</option><option value="FRIENDLY">Amical</option></select></div>
        <div className={s.opponentField}><label htmlFor="opponent" className={ui.label}>Adversaire <span className={s.required}>*</span></label><input type="text" id="opponent" name="opponent" list="belgian-clubs" placeholder="Rechercher ou saisir un club" required defaultValue={match?.opponent} className={ui.field} /><datalist id="belgian-clubs">{clubsData.map(club => <option key={club.matricule} value={club.nom}>Mat. {club.matricule}</option>)}</datalist><p className={s.hint}>Club du référentiel belge ou nom saisi librement.</p></div>
      </div>
      <fieldset className={s.scoreboard}>
        <legend>Le score final</legend>
        <div className={s.scoreInputs}>
          <div><label htmlFor="team_score">Ton équipe</label><input type="number" id="team_score" name="team_score" min="0" required defaultValue={match ? match.team_score ?? '' : '0'} placeholder="—" className={s.scoreInput} aria-describedby={match?.team_score === null ? 'team-score-hint' : undefined} />{match?.team_score === null && <p id="team-score-hint" className={s.hint}>Score non renseigné</p>}</div>
          <span className={s.scoreSeparator} aria-hidden="true">:</span>
          <div><label htmlFor="opponent_score">Adversaire</label><input type="number" id="opponent_score" name="opponent_score" min="0" required defaultValue={match ? match.opponent_score ?? '' : '0'} placeholder="—" className={s.scoreInput} aria-describedby={match?.opponent_score === null ? 'opponent-score-hint' : undefined} />{match?.opponent_score === null && <p id="opponent-score-hint" className={s.hint}>Score non renseigné</p>}</div>
        </div>
        <span className={s.scoreCaption}>DEUX ÉQUIPES. UNE RENCONTRE.</span>
      </fieldset>
    </section>

    <section className={`${s.panel} ${s.performance}`} aria-labelledby="performance-title">
      <div className={s.sectionHeading}><span className={s.sectionNumber}>02</span><div><h2 id="performance-title">Ton match</h2><p>Chaque contribution compte.</p></div><span className={s.sectionMark} aria-hidden="true">◎</span></div>
      {stat?.has_played === null ? <div className={`${s.participation} ${s.unknownBoolean}`}><label htmlFor="has_played" className={ui.label}>Participation au match</label><select id="has_played" name="has_played" required defaultValue="" className={ui.field} aria-describedby="participation-help"><option value="">Non renseignée — sélectionner</option><option value="true">J’ai participé</option><option value="false">Je n’ai pas participé</option></select><p className={s.hint}>Participation non renseignée à l’origine.</p></div> : <div className={s.participation}><input type="checkbox" id="has_played" name="has_played" value="true" defaultChecked={stat ? stat.has_played ?? false : true} aria-describedby="participation-help" /><label htmlFor="has_played"><strong>J’ai participé à ce match</strong><span>Décoche si tu n’es pas entré en jeu.</span></label></div>}
      <p id="participation-help" className={s.participationHelp}>Sans participation, les minutes, buts, passes décisives et MOTM ne sont pas comptés. Les cartons restent enregistrés.</p>
      <div className={s.playingFields}>
        <div><label htmlFor="minutes_played" className={ui.label}>Minutes jouées</label><div className={s.inputWithUnit}><input type="number" id="minutes_played" name="minutes_played" min="0" max="120" defaultValue={stat ? stat.minutes_played ?? '' : '90'} required={unknown('minutes_played')} placeholder="—" className={ui.field} aria-describedby={describedBy('minutes_played')} /><span aria-hidden="true">min</span></div>{hint('minutes_played')}</div>
        <div><label htmlFor="position_played" className={ui.label}>Poste occupé</label><select id="position_played" name="position_played" defaultValue={stat?.position_played || ''} className={ui.field}><option value="">Sélectionner...</option>{stat?.position_played && !positions.some(([code]) => code === stat.position_played) && <option value={stat.position_played}>{stat.position_played} · Poste enregistré</option>}{positions.map(([code, name]) => <option key={code} value={code}>{code} ({name})</option>)}</select></div>
        <div><label htmlFor="goals" className={ui.label}>Buts inscrits</label><input type="number" id="goals" name="goals" min="0" defaultValue={stat ? stat.goals ?? '' : 0} required={unknown('goals')} placeholder="—" className={ui.field} aria-describedby={describedBy('goals')} />{hint('goals')}</div>
        <div><label htmlFor="assists" className={ui.label}>Passes décisives</label><input type="number" id="assists" name="assists" min="0" defaultValue={stat ? stat.assists ?? '' : 0} required={unknown('assists')} placeholder="—" className={ui.field} aria-describedby={describedBy('assists')} />{hint('assists')}</div>
      </div>
      {stat?.is_motm === null ? <div className={`${s.motm} ${s.unknownBoolean}`}><label htmlFor="is_motm" className={ui.label}>Élu Homme du Match (MOTM)</label><select id="is_motm" name="is_motm" required defaultValue="" className={ui.field}><option value="">Non renseigné — sélectionner</option><option value="true">Oui</option><option value="false">Non</option></select><p className={s.hint}>MOTM non renseigné à l’origine.</p></div> : <div className={s.motm}><input type="checkbox" id="is_motm" name="is_motm" value="true" defaultChecked={stat?.is_motm ?? false} /><label htmlFor="is_motm"><span className={s.trophy} aria-hidden="true">✧</span><span>Élu Homme du Match <small>MOTM</small></span></label></div>}
    </section>

    <section className={`${s.panel} ${s.discipline}`} aria-labelledby="discipline-title">
      <div className={s.sectionHeading}><span className={s.sectionNumber}>03</span><div><h2 id="discipline-title">Discipline</h2><p>Avec ou sans entrée en jeu.</p></div><span className={s.cardsMark} aria-hidden="true"><i /><i /></span></div>
      <DisciplineFields initialYellowCards={stat?.yellow_cards} initialRedCards={stat?.red_cards} />
    </section>
  </div>
}
