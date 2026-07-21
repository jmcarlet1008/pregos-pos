import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BUSINESS_SETTINGS_ID, db } from '../../db'
import { Button, Modal } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { useAuth } from '../auth/AuthContext'
import { loadLines } from './CartPanel'
import { voidOrder } from './checkoutData'

export interface ReceiptScreenProps {
  orderId: string
  onDone: () => void
  doneLabel?: string
  printLabel?: string
}

export function ReceiptScreen({ orderId, onDone, doneLabel = 'New Order', printLabel = 'Print Receipt' }: ReceiptScreenProps) {
  const { user } = useAuth()
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const order = useLiveQuery(() => db.orders.get(orderId), [orderId])
  const payment = useLiveQuery(() => db.payments.where('order_id').equals(orderId).last(), [orderId])
  const lines = useLiveQuery(() => loadLines(orderId), [orderId]) ?? []
  const business = useLiveQuery(() => db.businessSettings.get(BUSINESS_SETTINGS_ID))

  async function handleVoid() {
    setVoiding(true)
    try {
      await voidOrder(orderId, user?.id ?? null)
      setConfirmVoidOpen(false)
    } finally {
      setVoiding(false)
    }
  }

  if (!order || !payment) {
    return (
      <div className="flex h-full items-center justify-center text-body-md text-on-surface-variant">
        Loading receipt…
      </div>
    )
  }

  const voided = order.status === 'voided'
  const printedAt = new Date(order.updated_at)

  return (
    <div className="mx-auto flex h-full w-full max-w-[480px] flex-col gap-md overflow-y-auto py-md">
      <div className="print-receipt flex flex-col gap-sm rounded-lg border border-surface-dim bg-surface-container-lowest p-md">
        <div className="text-center">
          {business?.logo_url && (
            <img src={business.logo_url} alt="" className="mx-auto mb-xs h-12 w-12 object-contain" />
          )}
          <h1 className="text-headline-md text-on-surface">{business?.name || "Prego's Cucina"}</h1>
          {business?.address && <p className="text-label-sm text-on-surface-variant">{business.address}</p>}
          {business?.phone && <p className="text-label-sm text-on-surface-variant">{business.phone}</p>}
          <p className="text-label-sm text-on-surface-variant">Order #{order.order_number}</p>
          <p className="text-label-sm text-on-surface-variant">{printedAt.toLocaleString()}</p>
          {voided && <p className="mt-xs text-label-bold uppercase text-error">Voided</p>}
        </div>

        <div className="border-t border-dashed border-surface-dim pt-sm">
          <ul className="flex flex-col gap-xs">
            {lines.map((line) => (
              <li key={line.id}>
                <div className="flex justify-between text-body-md text-on-surface">
                  <span>
                    {line.quantity}× {line.product_name}
                  </span>
                  <span>{formatCurrency(line.line_total)}</span>
                </div>
                {line.modifiers.map((mod) => (
                  <div key={mod.id} className="flex justify-between pl-md text-label-sm text-on-surface-variant">
                    <span>+ {mod.name}</span>
                    <span>{mod.price_adjustment > 0 ? formatCurrency(mod.price_adjustment) : ''}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-dashed border-surface-dim pt-sm">
          <div className="flex justify-between text-headline-md text-on-surface">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-surface-dim pt-sm text-body-md text-on-surface">
          {payment.method === 'cash' ? (
            <>
              <div className="flex justify-between">
                <span>Cash Tendered</span>
                <span>{formatCurrency(payment.amount_tendered)}</span>
              </div>
              <div className="flex justify-between">
                <span>Change</span>
                <span>{formatCurrency(payment.change)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span>Payment Method</span>
                <span>GCash</span>
              </div>
              <div className="flex justify-between">
                <span>Reference #</span>
                <span>{payment.gcash_reference ?? '—'}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-sm">
        <Button variant="primary" size="lg" fullWidth onClick={() => window.print()}>
          {printLabel}
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={onDone}>
          {doneLabel}
        </Button>
        {!voided && (
          <Button variant="danger" fullWidth onClick={() => setConfirmVoidOpen(true)}>
            Void Order
          </Button>
        )}
      </div>

      <Modal
        open={confirmVoidOpen}
        onClose={() => setConfirmVoidOpen(false)}
        title="Void Order"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmVoidOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={voiding} onClick={handleVoid}>
              Void Order
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">
          This restores stock deducted by Order #{order.order_number} and marks it voided. This can't be undone.
        </p>
      </Modal>
    </div>
  )
}
