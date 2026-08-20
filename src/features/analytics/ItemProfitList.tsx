import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { ItemProfit } from './analyticsData'

export function ItemProfitList({ items }: { items: ItemProfit[] }) {
  const rankableProfits = items.filter((i) => !(i.hasUnknown && i.cost === 0)).map((i) => Math.abs(i.profit))
  const maxProfit = Math.max(1, ...rankableProfits)

  return (
    <Card padding="md" className="flex min-h-0 flex-col gap-sm">
      <h2 className="text-label-bold text-on-surface-variant">Profit by Item</h2>
      {items.length === 0 ? (
        <p className="py-md text-center text-body-md text-on-surface-variant">No sales in this range.</p>
      ) : (
        <ol className="flex flex-col gap-sm">
          {items.map((item, index) => {
            // No known cost at all for this item — profit === sales is a fabricated
            // number (cost never got added to the total), so render it as N/A and give
            // the bar zero width rather than a width that implies a real profit figure.
            const unrankable = item.hasUnknown && item.cost === 0
            return (
              <li key={item.name} className="flex items-center gap-sm">
                <span className="w-5 shrink-0 text-label-bold text-on-surface-variant">{index + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-sm">
                    <span className="truncate text-body-md font-bold text-on-surface">
                      {item.name}
                      {item.hasUnknown && <span className="ml-1 text-label-sm text-on-surface-variant">*</span>}
                    </span>
                    <span className="shrink-0 text-body-md text-on-surface-variant">
                      {unrankable ? 'N/A' : formatCurrency(item.profit)}
                      {item.hasEstimated && !item.hasUnknown ? ' ≈' : ''}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    {!unrankable && (
                      <div
                        className={['h-full rounded-full', item.profit < 0 ? 'bg-error' : 'bg-primary'].join(' ')}
                        style={{ width: `${(Math.abs(item.profit) / maxProfit) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="flex items-baseline justify-between gap-sm text-label-sm text-on-surface-variant">
                    <span>Sales {formatCurrency(item.sales)}</span>
                    <span>Cost {unrankable ? 'N/A' : formatCurrency(item.cost)}</span>
                  </div>
                </div>
                <span className="w-14 shrink-0 text-right text-label-sm text-on-surface-variant">
                  x{item.quantity}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {items.some((i) => i.hasUnknown) && (
        <p className="text-label-sm text-on-surface-variant">* cost not set for one or more sales of this item</p>
      )}
    </Card>
  )
}
