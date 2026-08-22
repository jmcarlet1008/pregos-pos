import type { OpenState } from './businessHours'

export interface ClosedNoticeProps {
  state: Exclude<OpenState, { open: true }>
}

/** Shown instead of the ordering flow whenever evaluateOpenState says accepting_orders_today
 * is off — on load or on a Realtime BusinessSettings change. Never shown due to the delivery
 * window alone; that only constrains which time slot a customer can pick. */
export function ClosedNotice({ state: _state }: ClosedNoticeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-sm py-xl text-center">
      <span className="text-6xl">🍝</span>
      <h2 className="text-headline-md text-on-surface">We're closed right now</h2>
      <p className="max-w-[24rem] text-body-md text-on-surface-variant">
        We're closed right now. Please check back later!
      </p>
    </div>
  )
}
