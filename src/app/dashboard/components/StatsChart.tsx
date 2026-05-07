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
  yellow_cards: number
  red_cards: number
  opponent: string
}

interface StatsChartProps {
  data: ChartData[]
}

export default function StatsChart({ data }: StatsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-gray-500">
        Pas assez de données pour générer le graphique.
      </div>
    )
  }

  return (
    // Fixed height wrapper ensures Recharts never calculates a -1 height
    <div className="w-full">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: '#6B7280' }}
            tickLine={false}
            axisLine={{ stroke: '#E5E7EB' }}
            tickMargin={10}
          />
          
          <YAxis 
            allowDecimals={false} 
            tick={{ fontSize: 12, fill: '#6B7280' }}
            tickLine={false}
            axisLine={false}
          />
          
          <Tooltip 
            contentStyle={{ 
              borderRadius: '8px', 
              border: 'none', 
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              backgroundColor: '#ffffff'
            }}
            labelStyle={{ fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}
          />
          
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          
          <Line 
            type="monotone" 
            name="Buts"
            dataKey="goals" 
            stroke="#10B981" // Tailwind Emerald
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} 
          />
          
          <Line 
            type="monotone" 
            name="Passes dé."
            dataKey="assists" 
            stroke="#3B82F6" // Tailwind Blue
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} 
          />

          <Line 
            type="stepAfter" 
            name="Cartons Jaunes"
            dataKey="yellow_cards" 
            stroke="#EAB308" // Tailwind Yellow-500
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3, fill: '#EAB308' }}
          />

          <Line 
            type="stepAfter" // Step line makes more sense for rare discrete events like red cards
            name="Cartons Rouges"
            dataKey="red_cards" 
            stroke="#EF4444" // Tailwind Red
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3, fill: '#EF4444' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}