import { useState } from 'react'
import type { Order } from '../../db'
import { Button, Input, Modal } from '../../components/ui'
import { cancelOrder } from './orderManagementSupabaseData'

export interface CancelOrderModalProps {
  order: Order
  userId: string | null
  onClose: () => void
  onCancelled: () => void
}

export function CancelOrderModal({ order, userId, onClose, onCancelled }: CancelOrderModalProps) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!reason.trim()) return
    setSaving(true)
    setError(null)
    try {
      await cancelOrder(order.id, reason.trim(), userId)
      onCancelled()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel the order.')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel Order #${order.order_number ?? '—'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Never mind
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={saving || !reason.trim()}>
            {saving ? 'Cancelling…' : 'Cancel Order'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        <p className="text-body-md text-on-surface-variant">
          This restores any stock deducted for this order and marks it Cancelled everywhere it appears.
        </p>
        <Input
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer called to cancel"
          autoFocus
        />
        {error && <p className="text-body-md text-error">{error}</p>}
      </div>
    </Modal>
  )
}
