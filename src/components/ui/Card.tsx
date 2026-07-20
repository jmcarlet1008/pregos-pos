import type { HTMLAttributes } from 'react'

export type CardPadding = 'none' | 'sm' | 'md'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding
}

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-sm',
  md: 'p-md',
}

export function Card({ padding = 'md', className = '', children, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-lg border border-surface-dim bg-surface-container-lowest',
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
