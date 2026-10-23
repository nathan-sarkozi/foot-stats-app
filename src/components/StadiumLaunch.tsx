'use client'

import { useEffect, useRef } from 'react'
import FootStatsMark from './FootStatsMark'
import s from './stadium-motion.module.css'

// Document-scoped, not session storage: a reload may play the intro again.
// The instance token also tolerates React's development effect replay.
const documentLaunches = new WeakMap<Document, object>()

export function StadiumLaunch() {
  const element = useRef<HTMLDivElement>(null)
  const instance = useRef<object>({})

  useEffect(() => {
    const launch = element.current
    if (!launch) return
    const previous = documentLaunches.get(document)
    if (previous && previous !== instance.current) {
      launch.hidden = true
      return
    }
    documentLaunches.set(document, instance.current)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const dismiss = () => { launch.hidden = true }
    const animationEnd = (event: AnimationEvent) => { if (event.target === launch) dismiss() }
    const motionChange = () => { if (motion.matches) dismiss() }
    motionChange()
    // Dismissal is one-way. Losing focus must never restart a finished intro.
    document.addEventListener('focusin', dismiss)
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    launch.addEventListener('animationend', animationEnd)
    motion.addEventListener('change', motionChange)
    return () => {
      document.removeEventListener('focusin', dismiss)
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
      launch.removeEventListener('animationend', animationEnd)
      motion.removeEventListener('change', motionChange)
    }
  }, [])

  return <div ref={element} className={s.launch} aria-hidden="true" data-stadium-launch="">
    <div className={s.launchLights} />
    <div className={s.launchContent}>
      <span className={s.launchEyebrow}>LE JEU CONTINUE</span>
      <div className={s.launchBrand}><FootStatsMark /><span>footstats<span>.</span></span></div>
      <div className={s.launchPitch}><span /></div>
      <span className={s.launchCaption}>TON FOOTBALL. TA PROGRESSION.</span>
      <span className={s.launchLine} />
    </div>
  </div>
}
