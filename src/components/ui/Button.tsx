import { type ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-container active:bg-primary-container',
  secondary:
    'bg-transparent text-on-surface border border-on-surface hover:bg-surface-container active:bg-surface-container-high',
  ghost: 'bg-transparent text-primary hover:bg-surface-container active:bg-surface-container-high',
  danger: 'bg-error text-on-error hover:bg-error/90 active:bg-error/80',
}

const sizeClasses: Record<ButtonSize, string> = {
  md: 'min-h-touch px-6 text-body-md',
  lg: 'min-h-[56px] px-8 text-body-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth = false, className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex touch-target select-none items-center justify-center gap-2 rounded-lg font-body font-bold transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  )
})
