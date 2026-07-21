import { useEffect, useState } from 'react'
import { Button, Input } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { manualGCashProvider } from './ManualGCashProvider'
import type { CompletedPaymentInput, PaymentSession } from './PaymentProvider'

export interface GCashPaymentPanelProps {
  amountDue: number
  submitting: boolean
  onSubmit: (input: CompletedPaymentInput) => void
}

export function GCashPaymentPanel({ amountDue, submitting, onSubmit }: GCashPaymentPanelProps) {
  const [session, setSession] = useState<PaymentSession | null>(null)
  const [reference, setReference] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSession(null)
    manualGCashProvider.initiate(amountDue).then((next) => {
      if (!cancelled) setSession(next)
    })
    return () => {
      cancelled = true
    }
  }, [amountDue])

  async function handleConfirm() {
    if (!session) return
    setConfirming(true)
    try {
      const trimmed = reference.trim()
      await manualGCashProvider.confirm(session.sessionId, trimmed || null)
      const result = await manualGCashProvider.verify(session.sessionId)
      onSubmit({
        method: 'gcash',
        amount_tendered: amountDue,
        change: 0,
        gcash_reference: result.reference,
        status: result.status === 'confirmed' ? 'confirmed' : 'pending',
      })
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-md">
      <div className="text-center">
        <p className="text-label-bold text-on-surface-variant">Amount Due</p>
        <p className="text-headline-lg text-primary">{formatCurrency(amountDue)}</p>
      </div>

      <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-outline bg-surface-container">
        {session?.qrCodeUrl ? (
          <img
            src={session.qrCodeUrl}
            alt="GCash merchant QR code"
            className="h-full w-full rounded-lg object-contain"
          />
        ) : (
          <span className="px-sm text-center text-label-sm text-on-surface-variant">
            GCash QR code placeholder — set GCASH_QR_IMAGE_URL in payments/config.ts
          </span>
        )}
      </div>

      <div className="w-full max-w-[320px]">
        <Input
          label="Reference number (optional)"
          placeholder="e.g. 1234567890123"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!session || submitting || confirming}
        onClick={handleConfirm}
        className="max-w-[320px]"
      >
        Confirm Payment
      </Button>
    </div>
  )
}