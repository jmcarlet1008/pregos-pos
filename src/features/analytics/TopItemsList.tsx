import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { TopItem } from './analyticsData'

export function TopItemsList({ items }: { items: TopItem[] }) {
  const maxRevenue = Math.max(1, ...items.map((i) => i.revenue))

  return (
    <Card padding="md" className="flex min-h-0 flex-col gap-sm">
      <h2 className="text-label-bold text-on-surface-variant">Top Menu Items</h2>
      {items.length === 0 ? (
        <p className="py-md text-center text-body-md text-on-surface-variant">No sales in this range.</p>
      ) : (
        <ol className="flex flex-col gap-sm">
          {items.map((item, index) => (
            <li key={item.name} className="flex items-center gap-sm">
              <span className="w-5 shrink-0 text-label-bold text-on-surface-variant">{index + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-sm">
                  <span className="truncate text-body-md font-bold text-on-surface">{item.name}</span>
                  <span className="shrink-0 text-body-md text-on-surface-variant">{formatCurrency(item.revenue)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(item.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
              <span className="w-14 shrink-0 text-right text-label-sm text-on-surface-variant">
                x{item.quantity}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
