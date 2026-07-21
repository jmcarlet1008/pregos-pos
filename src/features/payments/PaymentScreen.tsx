import { useState } from 'react'
import type { PaymentMethod } from '../../db'
import { CashPaymentPanel } from './CashPaymentPanel'
import { GCashPaymentPanel } from './GCashPaymentPanel'
import type { CompletedPaymentInput } from './PaymentProvider'

export interface PaymentScreenProps {
  orderNumber: number
  amountDue: number
  initialMethod: PaymentMethod
  submitting: boolean
  onBack: () => void
  onSubmit: (input: CompletedPaymentInput) => void
}

export function PaymentScreen({
  orderNumber,
  amountDue,
  initialMethod,
  submitting,
  onBack,
  onSubmit,
}: PaymentScreenProps) {
  const [method, setMethod] = useState<PaymentMethod>(initialMethod)

  return (
    <div className="mx-auto flex h-full w-full max-w-[480px] flex-col gap-md overflow-y-auto py-md">
      <div className="flex items-center gap-sm">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="touch-target -ml-2 rounded-md px-xs text-label-bold text-primary hover:bg-surface-container disabled:pointer-events-none disabled:opacity-40"
        >
          ← Back
        </button>
        <h1 className="text-headline-md text-on-surface">Order #{orderNumber} — Payment</h1>
      </div>

      <div className="flex gap-xs rounded-full bg-surface-container p-1">
        <button
          type="button"
          onClick={() => setMethod('cash')}
          disabled={submitting}
          className={[
            'touch-target flex-1 rounded-full text-label-bold transition-colors',
            method === 'cash'
              ? 'bg-primary text-on-primary'
              : 'text-on-surface hover:bg-surface-container-high',
          ].join(' ')}
        >
          Cash
        </button>
        <button
          type="button"
          onClick={() => setMethod('gcash')}
          disabled={submitting}
          className={[
            'touch-target flex-1 rounded-full text-label-bold transition-colors',
            method === 'gcash'
              ? 'bg-primary text-on-primary'
              : 'text-on-surface hover:bg-surface-container-high',
          ].join(' ')}
        >
          GCash
        </button>
      </div>

      {method === 'cash' ? (
        <CashPaymentPanel amountDue={amountDue} submitting={submitting} onSubmit={onSubmit} />
      ) : (
        <GCashPaymentPanel amountDue={amountDue} submitting={submitting} onSubmit={onSubmit} />
      )}
    </div>
  )
}