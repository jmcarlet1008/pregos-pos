import { vibrate } from '../../lib/haptics'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const

export interface PinPadProps {
  value: string
  onChange: (value: string) => void
  maxLength?: number
  onComplete?: (value: string) => void
}

export function PinPad({ value, onChange, maxLength = 4, onComplete }: PinPadProps) {
  function pressDigit(digit: string) {
    if (value.length >= maxLength) return
    vibrate('tap')
    const next = value + digit
    onChange(next)
    if (next.length === maxLength) onComplete?.(next)
  }

  function pressBack() {
    vibrate('tap')
    onChange(value.slice(0, -1))
  }

  function pressClear() {
    vibrate('tap')
    onChange('')
  }

  return (
    <div className="flex flex-col items-center gap-md">
      <div className="flex gap-sm" aria-live="polite" aria-label="PIN entry">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={[
              'h-4 w-4 rounded-full border border-outline',
              i < value.length ? 'bg-primary border-primary' : 'bg-transparent',
            ].join(' ')}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-sm">
        {KEYS.map((key) => {
          if (key === 'clear') {
            return (
              <button
                key={key}
                type="button"
                onClick={pressClear}
                className="min-h-16 min-w-16 touch-target rounded-lg text-label-bold text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
              >
                Clear
              </button>
            )
          }
          if (key === 'back') {
            return (
              <button
                key={key}
                type="button"
                onClick={pressBack}
                aria-label="Backspace"
                className="min-h-16 min-w-16 touch-target flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M9 6L3 12L9 18M21 12H4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => pressDigit(key)}
              className="min-h-16 min-w-16 touch-target rounded-lg text-headline-md text-on-surface hover:bg-surface-container active:bg-surface-container-high"
            >
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
