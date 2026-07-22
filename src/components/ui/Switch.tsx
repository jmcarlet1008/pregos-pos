export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'touch-target relative inline-flex w-12 shrink-0 items-center justify-center',
        'disabled:pointer-events-none disabled:opacity-40',
      ].join(' ')}
    >
      <span
        className={[
          'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-surface-container-high',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </span>
    </button>
  )
}
