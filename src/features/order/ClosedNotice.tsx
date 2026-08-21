import type { OpenState } from './businessHours'
import { formatSlotLabel } from './businessHours'

export interface ClosedNoticeProps {
  state: Exclude<OpenState, { open: true }>
}

/** Shown instead of the ordering flow whenever evaluateOpenState says we're closed —
 * on load, on a Realtime accepting_orders_today change, or on the periodic wall-clock
 * re-check crossing the delivery window. */
export function ClosedNotice({ state }: ClosedNoticeProps) {
  const message = (() => {
    switch (state.reason) {
      case 'manual':
        return "We're closed right now. Please check back later!"
      case 'before_open':
        return `We're closed right now. We open today from ${formatSlotLabel(state.opensAt)} to ${formatSlotLabel(state.closesAt)}.`
      case 'after_close':
        return "We're closed for today. Thanks for stopping by — see you tomorrow!"
      default:
        return "We're closed right now. Please check back later!"
    }
  })()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-sm py-xl text-center">
      <span className="text-6xl">🍝</span>
      <h2 className="text-headline-md text-on-surface">We're closed right now</h2>
      <p className="max-w-[24rem] text-body-md text-on-surface-variant">{message}</p>
    </div>
  )
}
