'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { buildSeasonReview } from '@/utils/seasonReview'
import s from './season-review.module.css'

type Point = ReturnType<typeof buildSeasonReview>['timeline'][number]
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function SeasonJourney({ points }: { points: Point[] }) {
  if (!points.some(point => point.contributions !== null)) return <div className={s.chartEmpty}>Les contributions de ces rencontres ne sont pas assez renseignées pour tracer une courbe fiable. La chronologie ci-dessous conserve chaque rencontre.</div>
  const data = points.map(point => ({ ...point, label: date(point.date) }))
  return <div className={s.chart} role="group" aria-label="Contributions décisives par rencontre, dans l’ordre des dates">
    <ResponsiveContainer width="100%" height={280} minWidth={0} initialDimension={{ width: 700, height: 280 }}>
      <LineChart data={data} accessibilityLayer margin={{ top: 20, right: 16, bottom: 10, left: -25 }}>
        <CartesianGrid vertical={false} stroke="#30404c" strokeDasharray="3 5" />
        <XAxis dataKey="label" tick={{ fill: '#a0adb7', fontSize: 11 }} tickLine={false} axisLine={false} tickMargin={14} minTickGap={30} />
        <YAxis allowDecimals={false} tick={{ fill: '#a0adb7', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={({ active, payload }) => {
          const point = payload?.[0]?.payload as Point | undefined
          if (!active || !point) return null
          return <div className={s.tooltip}><strong>{date(point.date)} · {point.opponent}</strong><span>{point.goals ?? '—'} buts · {point.assists ?? '—'} passes décisives</span><span>{point.contributions ?? '—'} contributions décisives</span></div>
        }} />
        <Line name="Buts + passes décisives" dataKey="contributions" type="linear" connectNulls={false} stroke="#d5ea58" strokeWidth={2.5} dot={{ r: 3, fill: '#111820', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#d5ea58', strokeWidth: 0 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
}
