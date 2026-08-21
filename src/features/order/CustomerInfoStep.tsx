import { useState } from 'react'
import { Button, Input } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { cartLineTotal, cartTotal, type CartLine } from './cartTypes'
import { formatSlotLabel } from './businessHours'
import type { Fulfillment, PaymentInput } from './orderSupabaseData'

export interface CustomerInfoStepProps {
  lines: CartLine[]
  fulfillment: Fulfillment
  slot: string
  payment: PaymentInput
  submitting: boolean
  submitError: string | null
  onSubmit: (name: string, contact: string) => void
  onBack: () => void
}

export function CustomerInfoStep({
  lines,
  fulfillment,
  slot,
  payment,
  submitting,
  submitError,
  onSubmit,
  onBack,
}: CustomerInfoStepProps) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')

  const canSubmit = name.trim() !== '' && contact.trim() !== '' && !submitting

  return (
    <div className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Almost done!</h2>

      <div className="flex flex-col gap-xs rounded-md border border-surface-dim bg-surface-container px-md py-sm">
        <p className="text-label-bold text-on-surface-variant">Order Summary</p>
        <ul className="flex flex-col gap-[2px]">
          {lines.map((line) => (
            <li key={line.id} className="flex justify-between text-body-md text-on-surface">
              <span>
                {line.quantity}× {line.product.name}
              </span>
              <span>{formatCurrency(cartLineTotal(line))}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-surface-dim pt-xs text-body-md font-bold text-on-surface">
          <span>Total</span>
          <span>{formatCurrency(cartTotal(lines))}</span>
        </div>
        <p className="text-label-sm text-on-surface-variant">
          {fulfillment.type === 'pickup' ? 'Pickup' : `Delivery — ${fulfillment.zoneName}`} at {formatSlotLabel(slot)} ·{' '}
          {payment.method === 'cash' ? 'Cash' : 'GCash'}
        </p>
      </div>

      <Input label="Your Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Dela Cruz" />
      <Input
        label="Contact Number"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="0917 123 4567"
        type="tel"
      />

      {submitError && <p className="text-body-md text-error">{submitError}</p>}

      <div className="flex gap-sm">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button variant="primary" fullWidth disabled={!canSubmit} onClick={() => onSubmit(name, contact)}>
          {submitting ? 'Placing Order…' : 'Place Order'}
        </Button>
      </div>
    </div>
  )
}
