import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { ChartBucket, ChartMode } from './analyticsData'

const MODES: { value: ChartMode; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
]

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-surface-dim bg-surface-container-lowest px-sm py-xs shadow-sm">
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="text-label-bold text-on-surface">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
    </div>
  )
}

interface HourlySalesChartProps {
  mode: ChartMode
  onModeChange: (mode: ChartMode) => void
  data: ChartBucket[]
}

export function HourlySalesChart({ mode, onModeChange, data }: HourlySalesChartProps) {
  return (
    <Card padding="md" className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-label-bold text-on-surface-variant">
          {mode === 'today' ? 'Sales by Hour — Today' : 'Sales by Day — Last 7 Days'}
        </h2>
        <div className="flex gap-xs" role="tablist" aria-label="Chart range">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={mode === m.value}
              onClick={() => onModeChange(m.value)}
              className={[
                'touch-target rounded-full px-md text-body-md font-body font-bold transition-colors',
                mode === m.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#dbdad9" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: '#dbdad9' }}
              tick={{ fill: '#5d3f3b', fontSize: 12 }}
              interval={mode === 'today' ? 2 : 0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={0}
              tick={false}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: '#efeded' }} />
            <Bar dataKey="sales" fill="#970000" radius={[4, 4, 0, 0]} maxBarSize={mode === 'today' ? 18 : 48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
