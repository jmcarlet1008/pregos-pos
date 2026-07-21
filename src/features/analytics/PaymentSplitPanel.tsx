import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { PaymentSplit } from './analyticsData'

function orderCountLabel(count: number): string {
  return `${count} order${count === 1 ? '' : 's'}`
}

interface PaymentSplitPanelProps {
  split: PaymentSplit
  vat: number
}

export function PaymentSplitPanel({ split, vat }: PaymentSplitPanelProps) {
  const total = split.cash.amount + split.gcash.amount
  const cashPct = total ? (split.cash.amount / total) * 100 : 0
  const gcashPct = total ? 100 - cashPct : 0

  return (
    <Card padding="md" className="flex flex-col gap-sm">
      <h2 className="text-label-bold text-on-surface-variant">Payment Method Split</h2>

      <div className="grid grid-cols-2 gap-sm">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-label-sm font-bold text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            Cash
          </span>
          <span className="text-headline-md text-on-surface">{formatCurrency(split.cash.amount)}</span>
          <span className="text-label-sm text-on-surface-variant">{orderCountLabel(split.cash.count)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-label-sm font-bold text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-secondary" aria-hidden="true" />
            GCash
          </span>
          <span className="text-headline-md text-on-surface">{formatCurrency(split.gcash.amount)}</span>
          <span className="text-label-sm text-on-surface-variant">{orderCountLabel(split.gcash.count)}</span>
        </div>
      </div>

      {total > 0 && (
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full rounded-full bg-primary" style={{ width: `${cashPct}%` }} />
          <div className="h-full rounded-full bg-secondary" style={{ width: `${gcashPct}%` }} />
        </div>
      )}

      <p className="border-t border-surface-dim pt-sm text-label-sm text-on-surface-variant">
        VAT portion (ref. only, 12/112 of gross): {formatCurrency(vat)}
      </p>
    </Card>
  )
}
