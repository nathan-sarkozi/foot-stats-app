'use client'

import { useActionState, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { registerUser } from './actions'
import type { RegisterState } from './actions'
import { EMPTY_FORM_STATE } from '@/utils/formState'
import { FormFeedback } from '@/components/ActionForm'
import AvatarInput from '@/components/AvatarInput'
import { AVATAR_SIZE_LABEL } from '@/utils/avatar'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import Link from 'next/link'
import AuthFrame from '@/components/AuthFrame'
import ui from '@/components/stadium.module.css'
import s from './register.module.css'
import clubsData from '@/data/belgian_clubs.json' // Import du référentiel

export default function RegisterWizard() {
  const [step, setStep] = useState(1)
  const reducedMotion = useReducedMotion()
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(registerUser, EMPTY_FORM_STATE)
  
  const [formData, setFormData] = useState({
    display_name: '',
    club: '',
    category: '',
    preferred_position: '',
    foot_preference: '',
    jersey_number: '',
    height: '',
    weight: '',
  })

  const updateForm = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const nextStep = () => setStep(prev => prev + 1)
  const prevStep = () => setStep(prev => prev - 1)

  const inputBaseClasses = ui.field

  return (
    <AuthFrame mode="register">
      <div className={s.wizard}>
        
        <div className={s.progressHeader}>
          <ol className={s.steps} aria-label="Étapes d’inscription">{['Profil', 'Terrain', 'Physique', 'Sécurité'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} data-complete={step > index + 1}><span>{step > index + 1 ? '✓' : String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol>
          <div className={s.progressTrack} role="progressbar" aria-label="Progression de l’inscription" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step} aria-valuetext={`Étape ${step} sur 4`}>
            <motion.div 
              className={s.progressFill}
              initial={{ width: '25%' }}
              animate={{ width: `${(step / 4) * 100}%` }}
              transition={{ duration: reducedMotion ? 0 : 0.3 }}
            />
          </div>
        </div>

        <div className={s.card}>
          <FormFeedback state={state} variant="stade" />
          {state.accountCreated ? (
            <div className="mt-6 space-y-4">
              <Link href={state.needsConfirmation ? '/login' : '/dashboard/settings'} className={`${ui.primaryButton} ${s.fullWidth}`}>
                {state.needsConfirmation ? 'Se connecter' : 'Compléter mon profil'}
              </Link>
              {!state.needsConfirmation && (
                <Link href="/dashboard" className={`${ui.textLink} ${s.recoveryLink}`}>Accéder au dashboard</Link>
              )}
            </div>
          ) : <AnimatePresence mode="wait">
            
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={reducedMotion ? { duration: 0 } : undefined} className={s.step}>
                <div>
                  <h2 className={s.stepTitle}>Comment t&apos;appelles-tu ?</h2>
                  <p className={s.stepDescription}>C&apos;est le nom qui s&apos;affichera sur tes statistiques.</p>
                  <div className="mt-6">
                    <label htmlFor="register-display_name" className={ui.label}>Nom affiché</label>
                    <input id="register-display_name" type="text" placeholder="Pseudo ou Prénom" minLength={2} maxLength={50} value={formData.display_name} onChange={(e) => updateForm('display_name', e.target.value)} className={inputBaseClasses} />
                  </div>
                </div>
                <button onClick={nextStep} disabled={formData.display_name.trim().length < 2} className={`${ui.primaryButton} ${s.firstContinue}`}>
                  Continuer
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={reducedMotion ? { duration: 0 } : undefined} className={s.step}>
                <div>
                  <h2 className={s.stepTitle}>Où joues-tu ?</h2>
                  <div className="space-y-4 mt-6">
                    
                    {/* CHAMP CLUB AVEC DATALIST RBFA */}
                    <div>
                      <label htmlFor="register-club" className={ui.label}>Club</label>
                      <input id="register-club"
                        type="text" 
                        maxLength={100}
                        list="belgian-clubs"
                        placeholder="Ex: FC Enghiennois" 
                        value={formData.club} 
                        onChange={(e) => updateForm('club', e.target.value)} 
                        className={inputBaseClasses} 
                      />
                      <datalist id="belgian-clubs">
                        {clubsData.map((club) => (
                          <option key={club.matricule} value={club.nom}>
                            Mat. {club.matricule}
                          </option>
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label htmlFor="register-category" className={ui.label}>Catégorie</label>
                      <input id="register-category" type="text" placeholder="Ex: Réserve C" maxLength={50} value={formData.category} onChange={(e) => updateForm('category', e.target.value)} className={inputBaseClasses} />
                    </div>
                    <div>
                      <label htmlFor="register-preferred_position" className={ui.label}>Poste favori</label>
                      <select id="register-preferred_position" value={formData.preferred_position} onChange={(e) => updateForm('preferred_position', e.target.value)} className={inputBaseClasses}>
                        <option value="">Sélectionner...</option>
                        <option value="BU">Buteur (BU)</option>
                        <option value="AG">Ailier Gauche (AG)</option>
                        <option value="AD">Ailier Droit (AD)</option>
                        <option value="MOC">Milieu Offensif (MOC)</option>
                        <option value="MC">Milieu Central (MC)</option>
                        <option value="MDC">Milieu Défensif (MDC)</option>
                        <option value="DC">Défenseur Central (DC)</option>
                        <option value="GB">Gardien (GB)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className={s.actions}>
                  <button onClick={prevStep} className={ui.secondaryButton}>Retour</button>
                  <button onClick={nextStep} className={ui.primaryButton}>Continuer</button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={reducedMotion ? { duration: 0 } : undefined} className={s.step}>
                <div>
                  <h2 className={s.stepTitle}>Profil athlétique</h2>
                  <div className="space-y-4 mt-6">
                    <div>
                      <label htmlFor="register-foot_preference" className={ui.label}>Pied fort</label>
                      <select id="register-foot_preference" value={formData.foot_preference} onChange={(e) => updateForm('foot_preference', e.target.value)} className={inputBaseClasses}>
                        <option value="">Sélectionner...</option>
                        <option value="Droitier">Droitier</option>
                        <option value="Gaucher">Gaucher</option>
                        <option value="Ambidextre">Ambidextre</option>
                      </select>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-1/2">
                        <label htmlFor="register-height" className={ui.label}>Taille (cm)</label>
                        <input id="register-height" type="number" min={100} max={250} step={1} value={formData.height} onChange={(e) => updateForm('height', e.target.value)} className={inputBaseClasses} />
                      </div>
                      <div className="w-1/2">
                        <label htmlFor="register-weight" className={ui.label}>Poids (kg)</label>
                        <input id="register-weight" type="number" min={30} max={150} step={1} value={formData.weight} onChange={(e) => updateForm('weight', e.target.value)} className={inputBaseClasses} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="register-jersey_number" className={ui.label}>Numéro de maillot</label>
                      <input id="register-jersey_number" type="number" min={1} max={99} step={1} value={formData.jersey_number} onChange={(e) => updateForm('jersey_number', e.target.value)} className={inputBaseClasses} />
                    </div>
                  </div>
                </div>
                <div className={s.actions}>
                  <button onClick={prevStep} className={ui.secondaryButton}>Retour</button>
                  <button onClick={nextStep} className={ui.primaryButton}>Continuer</button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={reducedMotion ? { duration: 0 } : undefined} className={s.step}>
                <form action={formAction} onReset={(event) => event.preventDefault()} className={s.step}>
                  
                  {Object.entries(formData).map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={value} />
                  ))}

                  <div>
                    <h2 className={s.stepTitle}>Dernière étape</h2>
                    <p className={s.stepDescription}>Sécurise ton compte et finalise ton profil.</p>
                    
                    <div className="space-y-4 mt-6">
                      <div>
                        <label htmlFor="register-avatar" className={ui.label}>Photo de profil (Optionnelle, Max {AVATAR_SIZE_LABEL})</label>
                        <AvatarInput
                          id="register-avatar"
                          variant="stade"
                          className={s.avatarInput}
                        />
                      </div>

                      <div>
                        <label htmlFor="register-email" className={ui.label}>Adresse e-mail *</label>
                        <input id="register-email" type="email" name="email" required className={inputBaseClasses} />
                      </div>
                      <div>
                        <label htmlFor="register-password" className={ui.label}>Mot de passe *</label>
                        <input id="register-password" type="password" name="password" minLength={6} required className={inputBaseClasses} />
                      </div>
                    </div>
                  </div>
                  
                  <div className={s.actions}>
                    <button type="button" onClick={prevStep} disabled={pending} className={ui.secondaryButton}>Retour</button>
                    <div className={s.submitWrap}>
                      <SubmitButton defaultLabel="Créer le profil" loadingLabel="Création..." appearance="stade" className={s.fullWidth} />
                    </div>
                  </div>
                </form>
              </motion.div>
            )}
            
          </AnimatePresence>}
        </div>

        <p className={s.loginLink}>
          Déjà un compte ? <Link href="/login" className={ui.textLink}>Se connecter</Link>
        </p>

      </div>
    </AuthFrame>
  )
}
