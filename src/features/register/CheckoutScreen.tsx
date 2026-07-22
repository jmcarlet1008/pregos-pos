import { useLiveQuery } from 'dexie-react-hooks'
import type { Order, PaymentMethod } from '../../db'
import { Button } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { loadLines, type CartLineWithModifiers } from './CartPanel'
import { loadOrderDiscounts, removeOrderDiscount } from './discountData'
import { lineChargeAmount } from './registerData'

export interface CheckoutScreenProps {
  order: Order | undefined
  onLineTap: (line: CartLineWithModifiers) => void
  onAddItem: () => void
  onPay: (method: PaymentMethod) => void
  onOpenDiscountModal: () => void
}

const DISCOUNT_LABEL = { senior: 'Senior Citizen', pwd: 'PWD' } as const

export function CheckoutScreen({ order, onLineTap, onAddItem, onPay, onOpenDiscountModal }: CheckoutScreenProps) {
  const lines = useLiveQuery(() => (order ? loadLines(order.id) : undefined), [order?.id]) ?? []
  const discounts = useLiveQuery(() => (order ? loadOrderDiscounts(order.id) : undefined), [order?.id]) ?? []
  const discountById = new Map(discounts.map((d) => [d.id, d]))

  async function handleRemoveDiscount(discountId: string) {
    if (!order) return
    await removeOrderDiscount(discountId, order.id)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[640px] flex-col gap-md py-md">
      <div className="flex items-center justify-between">
        <h1 className="text-headline-lg text-on-surface">Order #{order?.order_number ?? '—'}</h1>
        <Button variant="secondary" onClick={onAddItem}>
          + Add Item
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="mt-lg text-center text-body-md text-on-surface-variant">
            No items yet. Add an item to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {lines.map((line) => {
              const discount = line.order_discount_id ? discountById.get(line.order_discount_id) : undefined
              return (
                <li key={line.id}>
                  <button
                    type="button"
                    onClick={() => onLineTap(line)}
                    className="w-full rounded-lg border border-surface-dim px-md py-sm text-left hover:border-primary hover:bg-surface-container"
                  >
                    <div className="flex items-start justify-between gap-sm">
                      <span className="text-body-lg font-bold text-on-surface">
                        {line.quantity}× {line.product_name}
                      </span>
                      {discount ? (
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="text-label-sm text-on-surface-variant line-through">
                            {formatCurrency(line.line_total)}
                          </span>
                          <span className="text-body-lg font-bold text-primary">
                            {formatCurrency(lineChargeAmount(line))}
                          </span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-body-lg font-bold text-on-surface">
                          {formatCurrency(line.line_total)}
                        </span>
                      )}
                    </div>
                    {discount && (
                      <span className="text-label-sm text-primary">
                        {DISCOUNT_LABEL[discount.discount_type]} — {discount.holder_name}
                      </span>
                    )}
                    {line.modifiers.length > 0 && (
                      <ul className="mt-xs flex flex-col">
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
              )
            })}
          </ul>
        )}
      </div>

      {discounts.length > 0 && (
        <div className="flex flex-col gap-xs border-t border-surface-dim pt-md">
          <span className="text-label-bold text-on-surface-variant">Applied Discounts</span>
          {discounts.map((discount) => {
            const coveredLines = lines.filter((line) => line.order_discount_id === discount.id)
            return (
              <div
                key={discount.id}
                className="flex items-center justify-between gap-sm rounded-md border border-surface-dim px-sm py-xs"
              >
                <span className="text-body-md text-on-surface">
                  {DISCOUNT_LABEL[discount.discount_type]} — {discount.holder_name} ({coveredLines.length} item
                  {coveredLines.length === 1 ? '' : 's'})
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveDiscount(discount.id)}
                  className="touch-target rounded-md px-sm text-label-bold text-error hover:bg-surface-container"
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-sm border-t border-surface-dim pt-md">
        <Button variant="secondary" fullWidth disabled={lines.length === 0} onClick={onOpenDiscountModal}>
          + Senior/PWD Discount
        </Button>
        <div className="flex items-center justify-between">
          <span className="text-headline-md text-on-surface">Total</span>
          <span className="text-headline-lg text-primary">{formatCurrency(order?.total ?? 0)}</span>
        </div>
        <div className="grid grid-cols-2 gap-sm">
          <Button variant="primary" size="lg" disabled={lines.length === 0} onClick={() => onPay('cash')}>
            Pay with Cash
          </Button>
          <Button variant="primary" size="lg" disabled={lines.length === 0} onClick={() => onPay('gcash')}>
            Pay with GCash
          </Button>
        </div>
      </div>
    </div>
  )
}
