import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Order } from '../../db'
import { Button, Modal, TrashIcon } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'

export interface HeldOrdersModalProps {
  open: boolean
  heldOrders: Order[]
  onResume: (orderId: string) => void
  onCancel: (orderId: string) => void
  onClose: () => void
}

function HeldOrderRow({
  order,
  onResume,
  onRequestCancel,
}: {
  order: Order
  onResume: (orderId: string) => void
  onRequestCancel: (order: Order) => void
}) {
  const lineCount = useLiveQuery(() => db.orderLines.where('order_id').equals(order.id).count(), [order.id]) ?? 0

  return (
    <div className="flex items-center gap-xs">
      <button
        type="button"
        onClick={() => onResume(order.id)}
        className="flex min-h-touch flex-1 items-center justify-between rounded-md border border-surface-dim px-sm py-xs text-left hover:border-primary hover:bg-surface-container"
      >
        <span className="text-body-md font-bold text-on-surface">
          Order #{order.order_number}
          <span className="ml-xs font-normal text-on-surface-variant">
            ({lineCount} item{lineCount === 1 ? '' : 's'})
          </span>
        </span>
        <span className="text-body-md font-bold text-primary">{formatCurrency(order.total)}</span>
      </button>
      <button
        type="button"
        onClick={() => onRequestCancel(order)}
        aria-label={`Remove held order #${order.order_number}`}
        className="touch-target flex shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
      >
        <TrashIcon width={20} height={20} />
      </button>
    </div>
  )
}

export function HeldOrdersModal({ open, heldOrders, onResume, onCancel, onClose }: HeldOrdersModalProps) {
  const [confirming, setConfirming] = useState<Order | null>(null)

  function handleConfirmCancel() {
    if (!confirming) return
    onCancel(confirming.id)
    setConfirming(null)
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Held Orders">
        {heldOrders.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No held orders.</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {heldOrders.map((order) => (
              <li key={order.id}>
                <HeldOrderRow order={order} onResume={onResume} onRequestCancel={setConfirming} />
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {confirming && (
        <Modal
          open
          onClose={() => setConfirming(null)}
          title="Remove held order?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Keep it
              </Button>
              <Button variant="danger" onClick={handleConfirmCancel}>
                Remove Order
              </Button>
            </>
          }
        >
          <p className="text-body-md text-on-surface">
            Order #{confirming.order_number} ({formatCurrency(confirming.total)}) will be removed from Held Orders.
            It was never paid, so nothing else is affected — this can't be undone.
          </p>
        </Modal>
      )}
    </>
  )
}
