import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { ChannelFulfillmentBreakdown, RangeStats } from './analyticsData'

function orderCountLabel(count: number): string {
  return `${count} order${count === 1 ? '' : 's'}`
}

interface SplitCellProps {
  dotClassName: string
  label: string
  amount: number
  count: number
}

function SplitCell({ dotClassName, label, amount, count }: SplitCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-label-sm font-bold text-on-surface-variant">
        <span className={`h-2 w-2 rounded-full ${dotClassName}`} aria-hidden="true" />
        {label}
      </span>
      <span className="text-headline-md text-on-surface">{formatCurrency(amount)}</span>
      <span className="text-label-sm text-on-surface-variant">{orderCountLabel(count)}</span>
    </div>
  )
}

interface ChannelFulfillmentBreakdownPanelProps {
  breakdown: ChannelFulfillmentBreakdown
  totals: RangeStats
}

/** Combined total for the current filter/date-range selection, plus its split by channel
 *  and by fulfillment kind — same Card/dot/amount/count structure as PaymentSplitPanel. */
export function ChannelFulfillmentBreakdownPanel({ breakdown, totals }: ChannelFulfillmentBreakdownPanelProps) {
  return (
    <Card padding="md" className="flex flex-col gap-sm">
      <h2 className="text-label-bold text-on-surface-variant">Channel & Fulfillment</h2>

      <div className="flex flex-col gap-1 border-b border-surface-dim pb-sm">
        <span className="text-label-sm font-bold text-on-surface-variant">Combined Total</span>
        <span className="text-headline-md text-on-surface">{formatCurrency(totals.grossSales)}</span>
        <span className="text-label-sm text-on-surface-variant">{orderCountLabel(totals.orderCount)}</span>
      </div>

      <div>
        <span className="text-label-sm font-bold text-on-surface-variant">Channel</span>
        <div className="mt-1 grid grid-cols-3 gap-sm">
          <SplitCell dotClassName="bg-primary" label="Dine-in" amount={breakdown.channel.in_store.amount} count={breakdown.channel.in_store.count} />
          <SplitCell dotClassName="bg-secondary" label="Online" amount={breakdown.channel.online.amount} count={breakdown.channel.online.count} />
          <SplitCell dotClassName="bg-success" label="Phone" amount={breakdown.channel.phone.amount} count={breakdown.channel.phone.count} />
        </div>
      </div>

      <div>
        <span className="text-label-sm font-bold text-on-surface-variant">Fulfillment</span>
        <div className="mt-1 grid grid-cols-3 gap-sm">
          <SplitCell
            dotClassName="bg-primary"
            label="Walk-in"
            amount={breakdown.fulfillment['walk-in'].amount}
            count={breakdown.fulfillment['walk-in'].count}
          />
          <SplitCell dotClassName="bg-secondary" label="Pickup" amount={breakdown.fulfillment.pickup.amount} count={breakdown.fulfillment.pickup.count} />
          <SplitCell dotClassName="bg-success" label="Delivery" amount={breakdown.fulfillment.delivery.amount} count={breakdown.fulfillment.delivery.count} />
        </div>
      </div>
    </Card>
  )
}
