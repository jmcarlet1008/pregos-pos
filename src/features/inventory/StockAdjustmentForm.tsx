import { useState, type FormEvent } from 'react'
import type { Product } from '../../db'
import { Button, Input } from '../../components/ui'
import { useAuth } from '../auth/AuthContext'
import { adjustStock, type ManualAdjustmentReason } from './inventoryData'

type Direction = 'add' | 'remove'

const REASONS: { value: ManualAdjustmentReason; label: string }[] = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'waste', label: 'Waste' },
  { value: 'correction', label: 'Correction' },
]

const tabClass = (active: boolean) =>
  [
    'touch-target flex-1 rounded-md text-body-md font-bold transition-colors',
    active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
  ].join(' ')

export function StockAdjustmentForm({ product }: { product: Product }) {
  const { user } = useAuth()
  const [direction, setDirection] = useState<Direction>('add')
  const [count, setCount] = useState('')
  const [reason, setReason] = useState<ManualAdjustmentReason>('delivery')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parsedCount = Number(count)
  const isValid = count.trim() !== '' && Number.isFinite(parsedCount) && parsedCount > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) {
      setError('Enter a count greater than 0.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const magnitude = Math.round(parsedCount)
      const delta = direction === 'add' ? magnitude : -magnitude
      await adjustStock(product.id, { delta, reason, note: note.trim() || null }, user?.id ?? null)
      setCount('')
      setNote('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
      <div className="flex gap-xs" role="tablist" aria-label="Adjustment direction">
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'add'}
          onClick={() => setDirection('add')}
          className={tabClass(direction === 'add')}
        >
          + Add
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'remove'}
          onClick={() => setDirection('remove')}
          className={tabClass(direction === 'remove')}
        >
          − Remove
        </button>
      </div>

      <Input
        type="number"
        min={1}
        inputMode="numeric"
        label={`Count (${product.unit})`}
        value={count}
        onChange={(e) => {
          setCount(e.target.value)
          setError(null)
        }}
        error={error ?? undefined}
      />

      <div className="flex flex-col gap-xs">
        <span className="text-label-bold text-on-surface">Reason</span>
        <div className="flex gap-xs" role="tablist" aria-label="Adjustment reason">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="tab"
              aria-selected={reason === r.value}
              onClick={() => setReason(r.value)}
              className={tabClass(reason === r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. supplier invoice #"
      />

      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Saving…' : 'Apply Adjustment'}
      </Button>
    </form>
  )
}
