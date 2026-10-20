import type { SVGProps } from 'react'

/** Shared stadium mark: navigation, launch screen and generated app icons. */
export default function FootStatsMark(props: SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m12 7 4 3-1.5 4.5h-5L8 10Zm0 0V3m4 7 4-1m-5.5 5.5 2.5 4m-7.5-4-2.5 4M8 10 4 9" />
  </svg>
}
