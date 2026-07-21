import { Button, Input } from '../../components/ui'
import { toDateInputValue } from './analyticsData'

export type DatePreset = 'today' | '7d' | '30d' | 'custom'

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
]

interface DateRangeFilterProps {
  preset: DatePreset
  start: Date
  end: Date
  onPresetChange: (preset: DatePreset) => void
  onStartChange: (date: Date) => void
  onEndChange: (date: Date) => void
  onExport: () => void
  exportDisabled: boolean
}

export function DateRangeFilter({
  preset,
  start,
  end,
  onPresetChange,
  onStartChange,
  onEndChange,
  onExport,
  exportDisabled,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-end gap-sm">
      <div className="flex gap-xs" role="tablist" aria-label="Date range preset">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={preset === p.value}
            onClick={() => onPresetChange(p.value)}
            className={[
              'touch-target shrink-0 whitespace-nowrap rounded-full px-md text-body-md font-body font-bold transition-colors',
              preset === p.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Input
        label="From"
        type="date"
        value={toDateInputValue(start)}
        onChange={(e) => e.target.value && onStartChange(new Date(`${e.target.value}T00:00:00`))}
        className="w-40"
      />
      <Input
        label="To"
        type="date"
        value={toDateInputValue(end)}
        onChange={(e) => e.target.value && onEndChange(new Date(`${e.target.value}T00:00:00`))}
        className="w-40"
      />

      <Button variant="secondary" onClick={onExport} disabled={exportDisabled} className="ml-auto">
        Export CSV
      </Button>
    </div>
  )
}
