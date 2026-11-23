import type { ReactNode } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { PaymentSplit } from './analyticsData'
import type { HourActivity, OrderMetrics } from './itemsAnalytics'
import { PeriodDelta } from './PeriodDelta'

function Tile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: ReactNode }) {
  return (
    <Card padding="md" className="flex flex-col gap-xs">
      <span className="text-label-bold text-on-surface-variant">{label}</span>
      <span className="text-headline-md text-on-surface">{value}</span>
      {sub && <span className="text-label-sm text-on-surface-variant">{sub}</span>}
      {children}
    </Card>
  )
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function HourTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as HourActivity | undefined
  if (!row) return null
  return (
    <div className="rounded-md border border-surface-dim bg-surface-container-lowest px-sm py-xs shadow-sm">
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="text-label-bold text-on-surface">{formatCurrency(row.sales)}</p>
      <p className="text-label-sm text-on-surface-variant">{plural(row.orders, 'order')}</p>
    </div>
  )
}

interface DailyMetricsPanelProps {
  current: OrderMetrics
  previous: OrderMetrics
  comparisonLabel: string
  hourly: HourActivity[]
  paymentSplit: PaymentSplit
  seniorPwd: { orders: number; discount: number }
  cancelled: { count: number; amount: number }
}

/**
 * Order-level figures for the selected range. Cancelled orders are shown on their own
 * tile only — they are never part of any sales figure here or anywhere else. Payment and
 * Senior/PWD discount amounts come from the existing computePaymentSplit/
 * computeBirBreakdown, so they match the panels further down exactly.
 */
export function DailyMetricsPanel({ current, previous, comparisonLabel, hourly, paymentSplit, seniorPwd, cancelled }: DailyMetricsPanelProps) {
  return (
    <div className="flex flex-col gap-sm">
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
        <Tile label="Orders" value={current.orderCount.toLocaleString('en-PH')}>
          <PeriodDelta current={current.orderCount} previous={previous.orderCount} label={comparisonLabel} />
        </Tile>
        <Tile label="Avg Order Value" value={formatCurrency(current.avgOrderValue)}>
          <PeriodDelta current={current.avgOrderValue} previous={previous.avgOrderValue} label={comparisonLabel} />
        </Tile>
        <Tile label="Avg Items per Order" value={current.avgItemsPerOrder.toFixed(1)} sub={`${current.itemCount.toLocaleString('en-PH')} items total`}>
          <PeriodDelta current={current.avgItemsPerOrder} previous={previous.avgItemsPerOrder} label={comparisonLabel} />
        </Tile>
      </div>

      <div className="grid grid-cols-2 gap-sm lg:grid-cols-4">
        <Tile label="Cash" value={formatCurrency(paymentSplit.cash.amount)} sub={plural(paymentSplit.cash.count, 'order')} />
        <Tile label="GCash" value={formatCurrency(paymentSplit.gcash.amount)} sub={plural(paymentSplit.gcash.count, 'order')} />
        <Tile label="Senior/PWD Orders" value={String(seniorPwd.orders)} sub={`${formatCurrency(seniorPwd.discount)} discount given`} />
        <Tile label="Cancelled Orders" value={String(cancelled.count)} sub={`${formatCurrency(cancelled.amount)} — not counted in sales`} />
      </div>

      <Card padding="md" className="flex flex-col gap-sm">
        <h2 className="text-label-bold text-on-surface-variant">Sales &amp; Orders by Hour — selected range</h2>
        {hourly.length === 0 ? (
          <p className="py-md text-center text-body-md text-on-surface-variant">No sales in this range.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#dbdad9" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#dbdad9' }} tick={{ fill: '#5d3f3b', fontSize: 12 }} />
                <YAxis yAxisId="sales" tickLine={false} axisLine={false} width={0} tick={false} />
                <YAxis yAxisId="orders" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={24} tick={{ fill: '#5d3f3b', fontSize: 12 }} />
                <Tooltip content={HourTooltip} cursor={{ fill: '#efeded' }} />
                <Bar yAxisId="sales" dataKey="sales" fill="#970000" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line yAxisId="orders" dataKey="orders" stroke="#5d3f3b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-label-sm text-on-surface-variant">Bars: sales · Line: number of orders (right axis)</p>
      </Card>
    </div>
  )
}
