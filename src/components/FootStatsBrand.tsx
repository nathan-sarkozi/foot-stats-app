import Link from 'next/link'
import s from './stadium.module.css'

export default function FootStatsBrand({ href = '/dashboard' }: { href?: string }) {
  return <Link href={href} className={s.brand} aria-label="FootStats — accueil">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10Zm0 0V3m4 7 4-1m-5.5 5.5 2.5 4m-7.5-4-2.5 4M8 10 4 9" /></svg>
    <span>footstats<span className={s.brandDot}>.</span></span>
  </Link>
}
