import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Order, type OrderLine, type OrderLineModifier } from '../../db'
import { Button } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'

export interface CartLineWithModifiers extends OrderLine {
  modifiers: OrderLineModifier[]
}

export async function loadLines(orderId: string): Promise<CartLineWithModifiers[]> {
  const lines = await db.orderLines.where('order_id').equals(orderId).sortBy('created_at')
  return Promise.all(
    lines.map(async (line) => ({
      ...line,
      modifiers: await db.orderLineModifiers.where('order_line_id').equals(line.id).toArray(),
    })),
  )
}

export interface CartPanelProps {
  order: Order | undefined
  onLineTap: (line: CartLineWithModifiers) => void
  onCheckout: () => void
  onHold: () => void
  onOpenHeld: () => void
  heldCount: number
}

export function CartPanel({ order, onLineTap, onCheckout, onHold, onOpenHeld, heldCount }: CartPanelProps) {
  const lines = useLiveQuery(() => (order ? loadLines(order.id) : undefined), [order?.id]) ?? []

  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-surface-dim bg-surface-container-lowest">
      <div className="flex items-center justify-between border-b border-surface-dim px-md py-sm">
        <span className="text-headline-md text-on-surface">Order #{order?.order_number ?? '—'}</span>
        <button
          type="button"
          onClick={onOpenHeld}
          disabled={heldCount === 0}
          className="touch-target rounded-md px-sm text-label-bold text-primary hover:bg-surface-container disabled:pointer-events-none disabled:opacity-40"
        >
          Held ({heldCount})
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-sm">
        {lines.length === 0 ? (
          <p className="mt-lg text-center text-body-md text-on-surface-variant">
            No items yet. Tap a product to add it.
          </p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {lines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  onClick={() => onLineTap(line)}
                  className="w-full rounded-md border border-surface-dim px-sm py-xs text-left hover:border-primary hover:bg-surface-container"
                >
                  <div className="flex items-start justify-between gap-sm">
                    <span className="text-body-md font-bold text-on-surface">
                      {line.quantity}× {line.product_name}
                    </span>
                    <span className="shrink-0 text-body-md font-bold text-on-surface">
                      {formatCurrency(line.line_total)}
                    </span>
                  </div>
                  {line.modifiers.length > 0 && (
                    <ul className="mt-[2px] flex flex-col">
                      {line.modifiers.map((mod) => (
                        <li key={mod.id} className="text-label-sm text-on-surface-variant">
                          + {mod.name}
                          {mod.price_adjustment > 0 ? ` (${formatCurrency(mod.price_adjustment)})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-sm border-t border-surface-dim p-md">
        <div className="flex items-center justify-between">
          <span className="text-headline-md text-on-surface">Total</span>
          <span className="text-headline-md text-primary">{formatCurrency(order?.total ?? 0)}</span>
        </div>
        <Button variant="primary" size="lg" fullWidth disabled={lines.length === 0} onClick={onCheckout}>
          Checkout
        </Button>
        <Button variant="secondary" fullWidth disabled={lines.length === 0} onClick={onHold}>
          Hold Order
        </Button>
      </div>
    </div>
  )
}
