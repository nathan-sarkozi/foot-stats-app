import type { ReactNode } from 'react'
import FootStatsBrand from './FootStatsBrand'
import s from './auth-frame.module.css'

export default function AuthFrame({ children, mode }: { children: ReactNode; mode: 'login' | 'register' }) {
  return <main className={s.frame}>
    <div className={s.shell}>
      <aside className={s.identity} aria-label="FootStats">
        <FootStatsBrand href="/" />
        <div className={s.editorial}><span className={s.eyebrow}>LE FOOTBALL, À TA FAÇON.</span><h1>{mode === 'login' ? <>Le terrain t’attend<span>.</span></> : <>Ton histoire<br />{' '}commence ici<span>.</span></>}</h1><p>Tes matchs. Tes saisons. Ton parcours.<br />Garde une trace du football que tu vis.</p></div>
        <div className={s.pitch} aria-hidden="true"><svg viewBox="0 0 420 235" fill="none"><rect x="12" y="12" width="396" height="211" rx="3" /><path d="M210 12v211M12 65h65v105H12m396-105h-65v105h65M12 92h25v51H12m396-51h-25v51h25" /><circle cx="210" cy="117.5" r="39" /><circle cx="210" cy="117.5" r="3" fill="currentColor" /><path d="m95 175 68-48 65 12 69-53" className={s.playLine} /><circle cx="95" cy="175" r="5" className={s.playDot} /><circle cx="163" cy="127" r="5" className={s.playDot} /><circle cx="228" cy="139" r="5" className={s.playDot} /><circle cx="297" cy="86" r="6" className={s.playDot} /></svg><span>CHAQUE MINUTE COMPTE.</span></div>
        <footer className={s.signature}><span>FOOTSTATS</span><span>LE JEU CONTINUE ↗</span></footer>
      </aside>
      <div className={s.formColumn}>{children}</div>
    </div>
  </main>
}
