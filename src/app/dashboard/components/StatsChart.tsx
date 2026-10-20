'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import s from '../stade.module.css'

interface ChartData {
  date: string
  goals: number
  assists: number
  opponent: string
}

interface StatsChartProps {
  data: ChartData[]
  variant?: 'default' | 'stade'
}

export default function StatsChart({ data, variant = 'default' }: StatsChartProps) {
  const stade = variant === 'stade'
  const goalsColor = stade ? '#D5EA58' : '#10B981'
  const assistsColor = stade ? '#80BFB5' : '#4F46E5'
  const gridColor = stade ? '#30404C' : '#E2E8F0'
  const labelColor = stade ? '#A0ADB7' : '#64748B'

  if (!data || data.length === 0) {
    return (
      <div className={stade ? s.chartEmpty : "flex h-80 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-500 font-medium"}>
        Pas assez de données pour générer le graphique.
      </div>
    )
  }

  return (
    <div className={stade ? s.chart : "w-full"} role={stade ? "group" : undefined} aria-label={stade ? "Cumul des buts et des passes décisives par rencontre" : undefined}>
      <ResponsiveContainer width="100%" height={320} minWidth={0} initialDimension={stade ? { width: 600, height: 320 } : undefined}>
        <LineChart
          data={data}
          accessibilityLayer
          margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: labelColor, fontWeight: 500 }}
            tickLine={false}
            axisLine={{ stroke: gridColor }}
            tickMargin={12}
          />
          
          <YAxis 
            allowDecimals={false} 
            tick={{ fontSize: 12, fill: labelColor, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
          />
          
          <Tooltip 
            contentStyle={{ 
              borderRadius: '12px', 
              border: `1px solid ${gridColor}`,
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              backgroundColor: stade ? '#22313E' : '#ffffff',
              color: stade ? '#F2F4F1' : '#0F172A'
            }}
            labelStyle={{ fontWeight: '800', color: stade ? '#F2F4F1' : '#0F172A', marginBottom: '8px' }}
          />
          
          <Legend wrapperStyle={{ paddingTop: '24px', fontWeight: 600, ...(stade ? { fontSize: 12 } : {}) }} />
          
          <Line 
            isAnimationActive={stade ? false : undefined}
            type="monotone" 
            name="Buts cumulés"
            dataKey="goals" 
            stroke={goalsColor}
            strokeWidth={3}
            dot={stade ? false : { r: 4, strokeWidth: 2, fill: '#ffffff' }}
            activeDot={{ r: 6, stroke: goalsColor, strokeWidth: 2, fill: stade ? '#1A2530' : '#ffffff' }}
          />
          
          <Line 
            isAnimationActive={stade ? false : undefined}
            type="monotone" 
            strokeDasharray={stade ? "5 4" : undefined}
            name="Passes décisives cumulées"
            dataKey="assists" 
            stroke={assistsColor}
            strokeWidth={3}
            dot={stade ? false : { r: 4, strokeWidth: 2, fill: '#ffffff' }}
            activeDot={{ r: 6, stroke: assistsColor, strokeWidth: 2, fill: stade ? '#1A2530' : '#ffffff' }}
          />
        </LineChart>
      </ResponsiveContainer>
      {stade && <details className={s.chartTable}>
        <summary>Lire les données du graphique</summary>
        <div className={s.tableScroll}><table><caption>Cumul des buts et des passes décisives, dans l’ordre des rencontres</caption><thead><tr><th scope="col">Date</th><th scope="col">Adversaire</th><th scope="col">Buts cumulés</th><th scope="col">Passes décisives cumulées</th></tr></thead><tbody>{data.map((point, index) => <tr key={index}><td>{point.date}</td><th scope="row">{point.opponent}</th><td>{point.goals}</td><td>{point.assists}</td></tr>)}</tbody></table></div>
      </details>}
    </div>
  )
}
