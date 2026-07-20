import { type InputHTMLAttributes, forwardRef, useId } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = '', ...props },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className="flex flex-col gap-xs">
      {label && (
        <label htmlFor={inputId} className="text-label-bold text-on-surface">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={[
          'min-h-touch rounded-md border bg-surface-container-lowest px-md text-body-md text-on-surface',
          'placeholder:text-on-surface-variant/60',
          'focus:outline-none focus:ring-0',
          error
            ? 'border-error focus:border-2 focus:border-error'
            : 'border-outline focus:border-2 focus:border-primary',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error && <span className="text-label-sm text-error">{error}</span>}
    </div>
  )
})
