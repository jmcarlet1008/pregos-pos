import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { DailyProfitPoint } from './analyticsData'

// Sales reuses the app's existing brand red (also used in HourlySalesChart); Cost is a
// blue chosen alongside it — validated with the dataviz skill's palette validator
// (CVD ΔE 28.2 deutan / normal-vision ΔE 34.4, both well clear of the safety floors).
const SALES_COLOR = '#970000'
const COST_COLOR = '#2a78d6'

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as DailyProfitPoint | undefined
  if (!point) return null
  return (
    <div className="rounded-md border border-surface-dim bg-surface-container-lowest px-sm py-xs shadow-sm">
      <p className="text-label-sm text-on-surface-variant">
        {label}
        {point.hasEstimated ? ' (incl. estimated cost)' : ''}
      </p>
      <p className="text-label-bold text-on-surface">Sales: {formatCurrency(point.sales)}</p>
      <p className="text-label-bold text-on-surface">Cost: {formatCurrency(point.cost)}</p>
      <p className="text-label-bold text-on-surface">Profit: {formatCurrency(point.profit)}</p>
      {point.hasUnknown && <p className="text-label-sm text-on-surface-variant">Some items missing cost</p>}
    </div>
  )
}

export function ProfitByDayChart({ data }: { data: DailyProfitPoint[] }) {
  return (
    <Card padding="md" className="flex flex-col gap-sm">
      <h2 className="text-label-bold text-on-surface-variant">Sales vs Cost by Day</h2>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#dbdad9" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: '#dbdad9' }}
              tick={{ fill: '#5d3f3b', fontSize: 12 }}
              interval={data.length > 14 ? 1 : 0}
            />
            <YAxis tickLine={false} axisLine={false} width={0} tick={false} />
            <Tooltip content={ChartTooltip} cursor={{ fill: '#efeded' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sales" name="Sales" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="cost" name="Cost" fill={COST_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
