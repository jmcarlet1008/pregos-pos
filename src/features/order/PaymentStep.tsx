import { useState } from 'react'
import type { BusinessSettings, PaymentMethod } from '../../db'
import { Button, Input } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { PaymentInput } from './orderSupabaseData'

export interface PaymentStepProps {
  amountDue: number
  settings: BusinessSettings
  onConfirm: (payment: PaymentInput) => void
  onBack: () => void
}

export function PaymentStep({ amountDue, settings, onConfirm, onBack }: PaymentStepProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [tendered, setTendered] = useState('')
  const [gcashConfirmed, setGcashConfirmed] = useState(false)

  const tenderedAmount = Number(tendered)
  const cashValid = tendered !== '' && Number.isFinite(tenderedAmount) && tenderedAmount >= amountDue

  function handleContinue() {
    if (method === 'cash') {
      if (!cashValid) return
      onConfirm({ method: 'cash', tendered: tenderedAmount })
    } else {
      if (!gcashConfirmed) return
      onConfirm({ method: 'gcash', confirmed: true })
    }
  }

  return (
    <div className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">How will you pay?</h2>
      <div className="flex items-center justify-between rounded-md border border-surface-dim bg-surface-container px-md py-sm">
        <span className="text-label-bold text-on-surface-variant">Amount Due</span>
        <span className="text-headline-md text-on-surface">{formatCurrency(amountDue)}</span>
      </div>

      <div className="flex gap-sm">
        <Button variant={method === 'cash' ? 'primary' : 'secondary'} fullWidth onClick={() => setMethod('cash')}>
          Cash
        </Button>
        <Button variant={method === 'gcash' ? 'primary' : 'secondary'} fullWidth onClick={() => setMethod('gcash')}>
          GCash
        </Button>
      </div>

      {method === 'cash' ? (
        <Input
          label="How much will you hand over?"
          type="number"
          inputMode="decimal"
          min={0}
          value={tendered}
          onChange={(e) => setTendered(e.target.value)}
          placeholder="0.00"
          error={tendered !== '' && !cashValid ? `Must be at least ${formatCurrency(amountDue)}` : undefined}
        />
      ) : (
        <div className="flex flex-col items-center gap-sm rounded-md border border-surface-dim bg-surface-container px-md py-md">
          <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border border-surface-dim bg-surface-container-lowest">
            {settings.gcash_qr_image ? (
              <img src={settings.gcash_qr_image} alt="GCash QR code" className="h-full w-full object-contain" />
            ) : (
              <span className="px-xs text-center text-label-sm text-on-surface-variant">QR code not available</span>
            )}
          </div>
          <p className="text-center text-body-md text-on-surface">
            Scan to send <strong>{formatCurrency(amountDue)}</strong> to{' '}
            <strong>{settings.gcash_number || 'our GCash number'}</strong>.
          </p>
          <p className="text-center text-label-sm text-on-surface-variant">
            After sending, please also send us a screenshot via Facebook Messenger so we can verify your payment — we
            don't collect proof in-app yet.
          </p>
          <Button variant={gcashConfirmed ? 'primary' : 'secondary'} onClick={() => setGcashConfirmed(true)}>
            {gcashConfirmed ? "✓ Payment Sent" : "I've Sent Payment"}
          </Button>
        </div>
      )}

      <div className="flex gap-sm">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          fullWidth
          disabled={method === 'cash' ? !cashValid : !gcashConfirmed}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
