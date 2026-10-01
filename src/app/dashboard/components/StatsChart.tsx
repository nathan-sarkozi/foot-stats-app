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

interface ChartData {
  date: string
  goals: number
  assists: number
  opponent: string
}

interface StatsChartProps {
  data: ChartData[]
}

export default function StatsChart({ data }: StatsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-500 font-medium">
        Pas assez de données pour générer le graphique.
      </div>
    )
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }}
            tickLine={false}
            axisLine={{ stroke: '#E2E8F0' }}
            tickMargin={12}
          />
          
          <YAxis 
            allowDecimals={false} 
            tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
          />
          
          <Tooltip 
            contentStyle={{ 
              borderRadius: '12px', 
              border: '1px solid #E2E8F0', 
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              backgroundColor: '#ffffff'
            }}
            labelStyle={{ fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}
          />
          
          <Legend wrapperStyle={{ paddingTop: '24px', fontWeight: 600 }} />
          
          <Line 
            type="monotone" 
            name="Buts Cumulés"
            dataKey="goals" 
            stroke="#10B981" 
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
            activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: '#ffffff' }} 
          />
          
          <Line 
            type="monotone" 
            name="Passes Cumulées"
            dataKey="assists" 
            stroke="#4F46E5" 
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
            activeDot={{ r: 6, stroke: '#4F46E5', strokeWidth: 2, fill: '#ffffff' }} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}