import { useState } from 'react'
import { Button } from '../../components/ui'
import { formatSlotLabel } from './businessHours'

export interface TimeSlotStepProps {
  slots: string[]
  title: string
  onConfirm: (slot: string) => void
  onBack: () => void
}

export function TimeSlotStep({ slots, title, onConfirm, onBack }: TimeSlotStepProps) {
  const [selected, setSelected] = useState(slots[0] ?? '')

  return (
    <div className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">{title}</h2>
      {slots.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No time slots are available for today anymore.</p>
      ) : (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="min-h-touch w-full rounded-md border border-outline bg-surface-container-lowest px-md text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
        >
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {formatSlotLabel(slot)}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-sm">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" fullWidth disabled={!selected} onClick={() => onConfirm(selected)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
