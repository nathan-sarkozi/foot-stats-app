import s from './stadium-motion.module.css'
import stadium from './stadium.module.css'
export { StadiumLaunch } from './StadiumLaunch'

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
