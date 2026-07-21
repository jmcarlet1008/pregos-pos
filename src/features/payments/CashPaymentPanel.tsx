import { useState } from 'react'
import { Button, Input } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { CASH_QUICK_AMOUNTS } from './config'
import type { CompletedPaymentInput } from './PaymentProvider'

export interface CashPaymentPanelProps {
  amountDue: number
  submitting: boolean
  onSubmit: (input: CompletedPaymentInput) => void
}

export function CashPaymentPanel({ amountDue, submitting, onSubmit }: CashPaymentPanelProps) {
  const [tendered, setTendered] = useState(0)
  const [customInput, setCustomInput] = useState('')

  const change = tendered - amountDue
  const isSufficient = tendered > 0 && tendered >= amountDue

  function addQuickAmount(amount: number) {
    setTendered((t) => t + amount)
    setCustomInput('')
  }

  function applyCustomAmount(raw: string) {
    setCustomInput(raw)
    const parsed = Number(raw)
    setTendered(raw !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
  }

  function clear() {
    setTendered(0)
    setCustomInput('')
  }

  function handleSubmit() {
    if (!isSufficient) return
    onSubmit({
      method: 'cash',
      amount_tendered: tendered,
      change,
      gcash_reference: null,
      status: 'confirmed',
    })
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <span className="text-label-bold text-on-surface-variant">Amount Due</span>
        <span className="text-headline-md text-on-surface">{formatCurrency(amountDue)}</span>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-surface-dim bg-surface-container px-md py-sm">
        <span className="text-label-bold text-on-surface-variant">Tendered</span>
        <span className="text-headline-md text-primary">{formatCurrency(tendered)}</span>
      </div>

      <div className="grid grid-cols-4 gap-sm">
        {CASH_QUICK_AMOUNTS.map((amount) => (
          <Button key={amount} type="button" variant="secondary" onClick={() => addQuickAmount(amount)}>
            ₱{amount}
          </Button>
        ))}
      </div>

      <div className="flex items-end gap-sm">
        <div className="flex-1">
          <Input
            label="Custom amount"
            type="number"
            inputMode="decimal"
            min={0}
            value={customInput}
            onChange={(e) => applyCustomAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <Button type="button" variant="ghost" onClick={clear}>
          Clear
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-surface-container-high px-md py-sm">
        <span className="text-label-bold text-on-surface-variant">
          {tendered > 0 && !isSufficient ? 'Amount Short' : 'Change'}
        </span>
        <span className={['text-headline-md', isSufficient ? 'text-on-surface' : 'text-error'].join(' ')}>
          {formatCurrency(Math.abs(change))}
        </span>
      </div>

      <Button variant="primary" size="lg" fullWidth disabled={!isSufficient || submitting} onClick={handleSubmit}>
        Complete Sale
      </Button>
    </div>
  )
}