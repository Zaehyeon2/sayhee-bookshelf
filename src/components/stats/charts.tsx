'use client'

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import type { CountItem } from '@/lib/stats-types'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const PALETTE = [
  '#3182f6',
  '#f04452',
  '#ffb331',
  '#1fc7c1',
  '#9061f9',
  '#fd6f22',
  '#51cf66',
  '#f783ac',
  '#748ffc',
  '#a9e34b',
]

export function CountBarChart({
  items,
  horizontal = false,
  color = PALETTE[0],
}: {
  items: CountItem[]
  horizontal?: boolean
  color?: string
}) {
  return (
    <Bar
      data={{
        labels: items.map((i) => i.label),
        datasets: [{ data: items.map((i) => i.count), backgroundColor: color, borderRadius: 4 }],
      }}
      options={{
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } },
        scales: { [horizontal ? 'x' : 'y']: { beginAtZero: true, ticks: { precision: 0 } } },
        maintainAspectRatio: false,
      }}
    />
  )
}

export function CountDoughnutChart({ items }: { items: CountItem[] }) {
  return (
    <Doughnut
      data={{
        labels: items.map((i) => i.label),
        datasets: [{ data: items.map((i) => i.count), backgroundColor: PALETTE }],
      }}
      options={{
        plugins: { legend: { position: 'bottom' } },
        maintainAspectRatio: false,
      }}
    />
  )
}
