import type { ModifierGroup, ModifierOption } from '../../db'
import { Button } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { formatDeliveryAddress } from '../../lib/orderWorkflow'
import { formatSlotLabel } from './businessHours'
import { cartLineTotal, cartTotal, type CartLine } from './cartTypes'
import type { Fulfillment, PaymentInput } from './orderSupabaseData'

export interface OrderConfirmationProps {
  orderId: string
  orderNumber: number | null
  lines: CartLine[]
  modifierGroups: ModifierGroup[]
  fulfillment: Fulfillment
  slot: string
  payment: PaymentInput
  customerName: string
  customerContact: string
  businessName: string
  onNewOrder: () => void
}

/** ModifierOption only carries modifier_group_id, not its group's name — this is the
 *  one place that needs to cross-reference modifierGroups to show e.g. "Size: Large"
 *  instead of a bare "Large" with no context. */
function modifierLabel(option: ModifierOption, modifierGroups: ModifierGroup[]): string {
  const group = modifierGroups.find((g) => g.id === option.modifier_group_id)
  return group ? `${group.name}: ${option.name}` : option.name
}

/** Shown only if the post-submission order-number assignment itself failed (see
 *  orderSupabaseData.ts's submitOnlineOrder) — the order was still placed successfully
 *  either way, so this is just something to point to rather than nothing at all. */
function fallbackReference(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase()
}

/**
 * One-time, full order summary shown immediately after a successful /order submission.
 * Renders entirely from data already collected during checkout — no live fetch, and
 * nothing here is revisitable once the customer leaves or places another order (see
 * OrderPage.tsx's submittedOrder state, cleared by handleNewOrder).
 */
export function OrderConfirmation({
  orderId,
  orderNumber,
  lines,
  modifierGroups,
  fulfillment,
  slot,
  payment,
  customerName,
  customerContact,
  businessName,
  onNewOrder,
}: OrderConfirmationProps) {
  const total = cartTotal(lines)

  return (
    <div className="flex flex-1 flex-col gap-md py-md">
      <div className="flex flex-col items-center gap-xs text-center">
        <span className="text-5xl">🎉</span>
        <h2 className="text-headline-md text-on-surface">Order placed!</h2>
        <span className="text-headline-lg font-bold text-primary">
          {orderNumber != null ? `Order #${orderNumber}` : `Reference: ${fallbackReference(orderId)}`}
        </span>
      </div>

      <div className="flex flex-col gap-sm rounded-md border border-surface-dim bg-surface-container px-md py-sm">
        <p className="text-label-bold text-on-surface-variant">Your Order</p>
        <ul className="flex flex-col gap-sm">
          {lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-sm text-body-md text-on-surface">
              <div className="flex flex-col">
                <span>
                  {line.quantity}× {line.product.name}
                </span>
                {line.selections.map((option) => (
                  <span key={option.id} className="pl-md text-label-sm text-on-surface-variant">
                    {modifierLabel(option, modifierGroups)}
                  </span>
                ))}
                {line.remarks && (
                  <span className="pl-md text-label-sm italic text-on-surface-variant">"{line.remarks}"</span>
                )}
              </div>
              <span className="shrink-0 font-bold">{formatCurrency(cartLineTotal(line))}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-surface-dim pt-xs text-body-lg font-bold text-on-surface">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-xs rounded-md border border-surface-dim bg-surface-container px-md py-sm">
        <p className="text-label-bold text-on-surface-variant">{fulfillment.type === 'pickup' ? '🏠 Pickup' : '🛵 Delivery'}</p>
        <p className="text-body-md text-on-surface">{formatSlotLabel(slot)}</p>
        {fulfillment.type === 'delivery' && (
          <>
            <p className="text-body-md font-bold text-on-surface">{fulfillment.zoneName}</p>
            <p className="text-body-md text-on-surface-variant">{formatDeliveryAddress(fulfillment.address)}</p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-xs rounded-md border border-surface-dim bg-surface-container px-md py-sm">
        <p className="text-label-bold text-on-surface-variant">Payment</p>
        {payment.method === 'cash' ? (
          <>
            <p className="text-body-md text-on-surface">Cash — {formatCurrency(payment.tendered)} tendered</p>
            <p className="text-body-md text-on-surface-variant">Change due: {formatCurrency(payment.tendered - total)}</p>
          </>
        ) : (
          <>
            <p className="text-body-md text-on-surface">GCash</p>
            <p className="text-body-md text-on-surface-variant">
              If you haven't already, please send your payment screenshot via Facebook Messenger — that's still how we
              verify GCash payments.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-xs rounded-md border border-surface-dim bg-surface-container px-md py-sm">
        <p className="text-label-bold text-on-surface-variant">Contact Details</p>
        <p className="text-body-md text-on-surface">{customerName}</p>
        <p className="text-body-md text-on-surface-variant">{customerContact}</p>
      </div>

      <p className="text-center text-body-md text-on-surface-variant">
        Thank you for ordering from <strong>{businessName}</strong>! We'll get started right away.
      </p>

      <Button variant="primary" onClick={onNewOrder} className="self-center">
        Place Another Order
      </Button>
    </div>
  )
}
