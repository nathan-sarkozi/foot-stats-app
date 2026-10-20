import s from './stadium-motion.module.css'
import stadium from './stadium.module.css'

/** Decorative document intro. The persistent root layout prevents navigation replays.
 * CSS hides it even without hydration; it never intercepts clicks or keyboard focus.
 */
export function StadiumLaunch() {
  return <div className={s.launch} aria-hidden="true" data-stadium-launch="">
    <div className={s.launchLights} />
    <div className={s.launchContent}>
      <span className={s.launchEyebrow}>LE JEU CONTINUE</span>
      <div className={s.launchBrand}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10Zm0 0V3m4 7 4-1m-5.5 5.5 2.5 4m-7.5-4-2.5 4M8 10 4 9" /></svg>
        <span>footstats<span>.</span></span>
      </div>
      <div className={s.launchPitch}><span /></div>
      <span className={s.launchCaption}>TON FOOTBALL. TA PROGRESSION.</span>
      <span className={s.launchLine} />
    </div>
  </div>
}

/** A real Suspense fallback, with no timer or data dependencies. */
export function StadiumLoading() {
  return <div className={`${stadium.page} ${s.loading}`} role="status" aria-live="polite" aria-busy="true">
    <span className={s.loadingLabel}>Chargement de ton espace FootStats…</span>
    <div className={s.skeleton} aria-hidden="true">
      <div className={s.skeletonHero}><span /><span /><span /></div>
      <div className={s.skeletonStats}>{[0, 1, 2, 3].map(key => <div key={key}><span /><span /></div>)}</div>
      <div className={s.skeletonPanels}><div /><div /></div>
    </div>
  </div>
}
