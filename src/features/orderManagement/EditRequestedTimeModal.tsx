import { useState } from 'react'
import type { BusinessSettings, Order } from '../../db'
import { Modal } from '../../components/ui'
import { generateTimeSlots, slotToIso } from '../order/businessHours'
import { TimeSlotStep } from '../order/TimeSlotStep'
import { updateRequestedTime } from './orderManagementSupabaseData'

export interface EditRequestedTimeModalProps {
  order: Order
  settings: BusinessSettings
  onClose: () => void
  onSaved: (requestedTimeIso: string) => void
}

/** Reuses /order's own TimeSlotStep for the picker, same as AddManualOrderFlow — only
 *  today's remaining slots are offered (see businessHours.ts's generateTimeSlots), same
 *  limitation the public ordering page already has. */
export function EditRequestedTimeModal({ order, settings, onClose, onSaved }: EditRequestedTimeModalProps) {
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const slots = generateTimeSlots(settings, now)

  async function handleConfirm(slot: string) {
    setError(null)
    try {
      const iso = slotToIso(slot, now)
      await updateRequestedTime(order.id, iso)
      onSaved(iso)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the requested time.')
    }
  }

  return (
    <Modal open onClose={onClose}>
      <div className="flex flex-col gap-sm">
        {error && <p className="text-body-md text-error">{error}</p>}
        <TimeSlotStep
          slots={slots}
          title={`New time for Order #${order.order_number ?? '—'}`}
          onConfirm={handleConfirm}
          onBack={onClose}
        />
      </div>
    </Modal>
  )
}
