import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { pctChange, type KpiData } from './analyticsData'

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = pctChange(current, previous)

  if (delta === null) {
    return <span className="text-label-sm text-on-surface-variant">vs yesterday: n/a</span>
  }

  const flat = Math.abs(delta) < 0.05
  const up = delta > 0
  const colorClass = flat ? 'text-on-surface-variant' : up ? 'text-[#0ca30c]' : 'text-error'
  const arrow = flat ? '•' : up ? '▲' : '▼'

  return (
    <span className={['flex items-center gap-1 text-label-sm font-bold', colorClass].join(' ')}>
      <span aria-hidden="true">{arrow}</span>
      {Math.abs(delta).toFixed(1)}% vs yesterday
    </span>
  )
}

interface KpiCardProps {
  label: string
  value: string
  current: number
  previous: number
}

function KpiCard({ label, value, current, previous }: KpiCardProps) {
  return (
    <Card padding="md" className="flex flex-col gap-xs">
      <span className="text-label-bold text-on-surface-variant">{label}</span>
      <span className="text-headline-lg text-on-surface">{value}</span>
      <DeltaBadge current={current} previous={previous} />
    </Card>
  )
}

export function KpiCards({ data }: { data: KpiData }) {
  const { today, yesterday } = data
  return (
    <div className="grid grid-cols-1 gap-sm @sm:grid-cols-3">
      <KpiCard
        label="Gross Sales (Today)"
        value={formatCurrency(today.grossSales)}
        current={today.grossSales}
        previous={yesterday.grossSales}
      />
      <KpiCard
        label="Total Orders (Today)"
        value={String(today.orderCount)}
        current={today.orderCount}
        previous={yesterday.orderCount}
      />
      <KpiCard
        label="Avg Ticket Size (Today)"
        value={formatCurrency(today.avgTicket)}
        current={today.avgTicket}
        previous={yesterday.avgTicket}
      />
    </div>
  )
}
