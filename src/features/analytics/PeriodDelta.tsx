import { pctChange } from './analyticsData'

/** Small ▲/▼ % vs the previous equal period — same look as KpiCards' badge, but with
 *  a caller-supplied comparison label ("vs yesterday", "vs previous 7 days", …). */
export function PeriodDelta({ current, previous, label }: { current: number; previous: number; label: string }) {
  const delta = pctChange(current, previous)

  if (delta === null) {
    return <span className="text-label-sm text-on-surface-variant">{label}: n/a</span>
  }

  const flat = Math.abs(delta) < 0.05
  const up = delta > 0
  const colorClass = flat ? 'text-on-surface-variant' : up ? 'text-[#0ca30c]' : 'text-error'
  const arrow = flat ? '•' : up ? '▲' : '▼'

  return (
    <span className={['flex items-center gap-1 text-label-sm font-bold', colorClass].join(' ')}>
      <span aria-hidden="true">{arrow}</span>
      {Math.abs(delta).toFixed(1)}% {label}
    </span>
  )
}
