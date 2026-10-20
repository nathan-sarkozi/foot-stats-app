'use client'

import { useState } from 'react'
import ui from '@/components/stadium.module.css'
import s from '../match-editor.module.css'

export default function DisciplineFields({ initialYellowCards = 0, initialRedCards = 0 }: {
  initialYellowCards?: number | null
  initialRedCards?: number | null
}) {
  const [yellowCards, setYellowCards] = useState(initialYellowCards === null ? '' : String(initialYellowCards))
  // Keep the manually entered/stored red separate from the automatic expulsion.
  // An existing red is always preserved: its historical origin is unknown.
  const [manualRedCards, setManualRedCards] = useState(initialRedCards === null ? '' : String(initialRedCards))
  const twoYellows = yellowCards !== '' && Number(yellowCards) === 2
  const redCards = twoYellows ? '1' : manualRedCards

  return <>
    <div className={s.disciplineFields}>
      <div><label htmlFor="yellow_cards" className={ui.label}>Cartons jaunes</label><input type="number" id="yellow_cards" name="yellow_cards" min="0" max="2" required value={yellowCards} onChange={event => setYellowCards(event.target.value)} placeholder="—" className={ui.field} aria-describedby={`card-rule${initialYellowCards === null ? ' yellow_cards-hint' : ''}`} />{initialYellowCards === null && <p id="yellow_cards-hint" className={s.hint}>Valeur historique non renseignée. Saisis une valeur connue, 0 si aucun.</p>}</div>
      <div><label htmlFor="red_cards" className={ui.label}>Cartons rouges</label><input type="number" id="red_cards" name="red_cards" min="0" max="1" required value={redCards} onChange={event => setManualRedCards(event.target.value)} readOnly={twoYellows} placeholder="—" className={ui.field} aria-describedby={`red-cards-help${initialRedCards === null && !twoYellows ? ' red_cards-hint' : ''}`} />{initialRedCards === null && !twoYellows && <p id="red_cards-hint" className={s.hint}>Valeur historique non renseignée. Saisis une valeur connue, 0 si aucun.</p>}</div>
    </div>
    <p id="card-rule" className={s.hint}>Deux cartons jaunes entraînent une expulsion.</p>
    <p id="red-cards-help" className={s.hint} role="status">{twoYellows ? 'Le rouge est renseigné automatiquement pour les deux jaunes.' : 'Un rouge direct peut être renseigné indépendamment des jaunes.'}</p>
  </>
}
