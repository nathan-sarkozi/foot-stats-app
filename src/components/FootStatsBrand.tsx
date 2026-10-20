import Link from 'next/link'
import FootStatsMark from './FootStatsMark'
import s from './stadium.module.css'

export default function FootStatsBrand({ href = '/dashboard' }: { href?: string }) {
  return <Link href={href} className={s.brand} aria-label="FootStats — accueil">
    <FootStatsMark />
    <span>footstats<span className={s.brandDot}>.</span></span>
  </Link>
}
