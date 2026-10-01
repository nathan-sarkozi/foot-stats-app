'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { registerUser } from './actions'
import SubmitButton from '@/app/dashboard/components/SubmitButton'
import Link from 'next/link'
import clubsData from '@/data/belgian_clubs.json' // Import du référentiel

export default function RegisterWizard() {
  const [step, setStep] = useState(1)
  
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

  const inputBaseClasses = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 text-lg transition-all"

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        
        <div className="mb-8">
          <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 px-1">
            <span>Profil</span>
            <span>Terrain</span>
            <span>Physique</span>
            <span>Sécurité</span>
          </div>
          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-indigo-600"
              initial={{ width: '25%' }}
              animate={{ width: `${(step / 4) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative min-h-100">
          <AnimatePresence mode="wait">
            
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="flex flex-col h-full justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">Comment t&apos;appelles-tu ?</h2>
                  <p className="text-slate-500 text-sm mt-2">C&apos;est le nom qui s&apos;affichera sur tes statistiques.</p>
                  <div className="mt-6">
                    <input type="text" placeholder="Pseudo ou Prénom" value={formData.display_name} onChange={(e) => updateForm('display_name', e.target.value)} className={inputBaseClasses} />
                  </div>
                </div>
                <button onClick={nextStep} disabled={!formData.display_name} className="mt-8 w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  Continuer
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="flex flex-col h-full justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">Où joues-tu ?</h2>
                  <div className="space-y-4 mt-6">
                    
                    {/* CHAMP CLUB AVEC DATALIST RBFA */}
                    <div>
                      <label className="text-sm font-bold text-slate-700">Club</label>
                      <input 
                        type="text" 
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
                      <label className="text-sm font-bold text-slate-700">Catégorie</label>
                      <input type="text" placeholder="Ex: Réserve C" value={formData.category} onChange={(e) => updateForm('category', e.target.value)} className={inputBaseClasses} />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700">Poste favori</label>
                      <select value={formData.preferred_position} onChange={(e) => updateForm('preferred_position', e.target.value)} className={inputBaseClasses}>
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
                <div className="flex gap-3 mt-8">
                  <button onClick={prevStep} className="w-1/3 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">Retour</button>
                  <button onClick={nextStep} className="w-2/3 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all">Continuer</button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="flex flex-col h-full justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">Profil athlétique</h2>
                  <div className="space-y-4 mt-6">
                    <div>
                      <label className="text-sm font-bold text-slate-700">Pied fort</label>
                      <select value={formData.foot_preference} onChange={(e) => updateForm('foot_preference', e.target.value)} className={inputBaseClasses}>
                        <option value="">Sélectionner...</option>
                        <option value="Droitier">Droitier</option>
                        <option value="Gaucher">Gaucher</option>
                        <option value="Ambidextre">Ambidextre</option>
                      </select>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-1/2">
                        <label className="text-sm font-bold text-slate-700">Taille (cm)</label>
                        <input type="number" value={formData.height} onChange={(e) => updateForm('height', e.target.value)} className={inputBaseClasses} />
                      </div>
                      <div className="w-1/2">
                        <label className="text-sm font-bold text-slate-700">Poids (kg)</label>
                        <input type="number" value={formData.weight} onChange={(e) => updateForm('weight', e.target.value)} className={inputBaseClasses} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700">Numéro de maillot</label>
                      <input type="number" value={formData.jersey_number} onChange={(e) => updateForm('jersey_number', e.target.value)} className={inputBaseClasses} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={prevStep} className="w-1/3 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">Retour</button>
                  <button onClick={nextStep} className="w-2/3 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all">Continuer</button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="flex flex-col h-full justify-between">
                <form action={registerUser} className="flex flex-col h-full justify-between">
                  
                  {Object.entries(formData).map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={value} />
                  ))}

                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-900">Dernière étape</h2>
                    <p className="text-slate-500 text-sm mt-2">Sécurise ton compte et finalise ton profil.</p>
                    
                    <div className="space-y-4 mt-6">
                      <div>
                        <label className="text-sm font-bold text-slate-700">Photo de profil (Optionnelle, Max 5MB)</label>
                        <input 
                          type="file" 
                          name="avatar" 
                          accept="image/png, image/jpeg, image/webp"
                          className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer border border-slate-200 p-2 rounded-xl bg-white"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-bold text-slate-700">Adresse e-mail *</label>
                        <input type="email" name="email" required className={inputBaseClasses} />
                      </div>
                      <div>
                        <label className="text-sm font-bold text-slate-700">Mot de passe *</label>
                        <input type="password" name="password" required className={inputBaseClasses} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 mt-8">
                    <button type="button" onClick={prevStep} className="w-1/3 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">Retour</button>
                    <div className="w-2/3">
                      <SubmitButton defaultLabel="Créer le profil" loadingLabel="Création..." className="w-full py-3 rounded-xl text-lg" />
                    </div>
                  </div>
                </form>
              </motion.div>
            )}
            
          </AnimatePresence>
        </div>

        <p className="text-center mt-6 text-sm text-slate-500 font-medium">
          Déjà un compte ? <Link href="/login" className="text-indigo-600 hover:underline">Se connecter</Link>
        </p>

      </div>
    </div>
  )
}