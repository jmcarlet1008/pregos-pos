import type { Order, OrderLine, OrderLineModifier } from '../../db'
import { formatCurrency } from '../../lib/currency'
import { formatDeliveryAddress } from '../../lib/orderWorkflow'

export type FulfillmentCardVariant = 'walk-in' | 'pickup' | 'ready-to-dispatch' | 'delivery-queue'

export interface FulfillmentOrderCardProps {
  order: Order
  lines: OrderLine[]
  modifiersByLineId: Map<string, OrderLineModifier[]>
  variant: FulfillmentCardVariant
  actionLabel: string
  /** Deliberately not the shared Button component's variant palette — see
   *  FulfillmentPage.tsx's COLUMN_THEME comment for why this screen breaks theme. */
  actionColor: 'green' | 'orange'
  onAction: () => void
}

/** Duplicated from KitchenOrderCard.tsx (not exported there) — kept identical so the
 *  two hand-off screens format times the same way. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Same GCash/Cash rendering as KitchenOrderCard.tsx's footer, extended to also show
 *  computed change for cash (Order has no stored `change` field — only the separate
 *  Payment entity does — so it's derived here as tendered minus total). */
function formatPayment(order: Order): string {
  if (order.payment_method === 'gcash') {
    return `GCash${order.gcash_customer_confirmed ? ' ✓' : ''}`
  }
  if (order.cash_tendered_amount == null) return 'Cash'
  const change = order.cash_tendered_amount - order.total
  const changeSuffix = change > 0 ? ` · ${formatCurrency(change)} change` : ''
  return `Cash · ${formatCurrency(order.cash_tendered_amount)} tendered${changeSuffix}`
}

const showsContact = (variant: FulfillmentCardVariant) => variant !== 'walk-in'
const showsAddress = (variant: FulfillmentCardVariant) => variant === 'delivery-queue'

const ACTION_BUTTON_CLASSES: Record<'green' | 'orange', string> = {
  green: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
  orange: 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800',
}

export function FulfillmentOrderCard({
  order,
  lines,
  modifiersByLineId,
  variant,
  actionLabel,
  actionColor,
  onAction,
}: FulfillmentOrderCardProps) {
  return (
    <div className="flex flex-col gap-sm rounded-lg border border-surface-dim bg-surface-container-lowest p-md">
      <div className="flex flex-wrap items-center justify-between gap-xs">
        <span className="text-headline-md text-on-surface">#{order.order_number ?? '—'}</span>
        <span className="text-label-bold text-on-surface-variant">
          {order.requested_time ? `Requested ${formatTime(order.requested_time)}` : '—'}
        </span>
      </div>

      {lines.length > 0 && (
        <div className="flex flex-col gap-xs">
          {lines.map((line) => (
            <div key={line.id}>
              <div className="text-body-lg font-bold text-on-surface">
                <span className="text-primary">{line.quantity}×</span> {line.product_name}
              </div>
              {(modifiersByLineId.get(line.id) ?? []).map((mod) => (
                <div key={mod.id} className="pl-md text-body-md text-on-surface-variant">
                  + {mod.name}
                </div>
              ))}
              {line.remarks && <div className="pl-md text-body-md italic text-on-surface-variant">"{line.remarks}"</div>}
            </div>
          ))}
        </div>
      )}

      {showsContact(variant) && (
        <div className="flex flex-col gap-[2px] text-body-md text-on-surface-variant">
          <span className="font-bold text-on-surface">{order.customer_name ?? '—'}</span>
          <span>📞 {order.customer_contact ?? '—'}</span>
          {showsAddress(variant) && order.delivery_address && <span>📍 {formatDeliveryAddress(order.delivery_address)}</span>}
        </div>
      )}

      {showsAddress(variant) && order.delivery_lat != null && order.delivery_lng != null && (
        <a
          href={`https://www.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-label-bold text-primary underline"
        >
          View on Map
        </a>
      )}

      <div className="flex flex-wrap items-center justify-between gap-sm border-t border-dashed border-surface-dim pt-xs text-label-bold text-on-surface-variant">
        <span>{formatCurrency(order.total)}</span>
        <span>{formatPayment(order)}</span>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onAction}
          className={`inline-flex min-h-[56px] touch-target select-none items-center justify-center rounded-lg px-8 text-body-lg font-body font-bold text-white transition-colors ${ACTION_BUTTON_CLASSES[actionColor]}`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
