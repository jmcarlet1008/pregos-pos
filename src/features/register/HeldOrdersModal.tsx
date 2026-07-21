import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Order } from '../../db'
import { Modal } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'

export interface HeldOrdersModalProps {
  open: boolean
  heldOrders: Order[]
  onResume: (orderId: string) => void
  onClose: () => void
}

function HeldOrderRow({ order, onResume }: { order: Order; onResume: (orderId: string) => void }) {
  const lineCount = useLiveQuery(() => db.orderLines.where('order_id').equals(order.id).count(), [order.id]) ?? 0

  return (
    <button
      type="button"
      onClick={() => onResume(order.id)}
      className="flex min-h-touch w-full items-center justify-between rounded-md border border-surface-dim px-sm py-xs text-left hover:border-primary hover:bg-surface-container"
    >
      <span className="text-body-md font-bold text-on-surface">
        Order #{order.order_number}
        <span className="ml-xs font-normal text-on-surface-variant">
          ({lineCount} item{lineCount === 1 ? '' : 's'})
        </span>
      </span>
      <span className="text-body-md font-bold text-primary">{formatCurrency(order.total)}</span>
    </button>
  )
}

export function HeldOrdersModal({ open, heldOrders, onResume, onClose }: HeldOrdersModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Held Orders">
      {heldOrders.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No held orders.</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {heldOrders.map((order) => (
            <li key={order.id}>
              <HeldOrderRow order={order} onResume={onResume} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
