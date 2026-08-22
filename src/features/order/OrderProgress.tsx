import type { FulfillmentType } from '../../db'
import type { Screen } from './OrderPage'

/**
 * Step captions for the checkout progress bar. Pickup and delivery orders have
 * different lengths — delivery inserts a "Delivery Details" step for the zone/address
 * form pickup never shows. Confirmation is included as the final step (not treated as a
 * separate "done" state outside the count) so the bar visibly reaches 100% on success.
 */
const PICKUP_STEPS = ['Your Order', 'Fulfillment', 'Pickup Time', 'Payment', 'Your Info', 'Done']
const DELIVERY_STEPS = ['Your Order', 'Fulfillment', 'Delivery Details', 'Delivery Time', 'Payment', 'Your Info', 'Done']

/**
 * Which step list applies, and where `screen` falls in it. Until the customer actually
 * picks Pickup or Delivery (fulfillmentType is still null, on the menu/fulfillment
 * screens), this defaults to the shorter pickup-shaped list — the total legitimately
 * grows by one the moment they pick Delivery, same as many real checkouts where the
 * step count isn't fixed until enough is known about the order.
 */
export function orderProgressFor(screen: Screen, fulfillmentType: FulfillmentType | null): { steps: string[]; currentIndex: number } {
  const steps = fulfillmentType === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS
  const indexByScreen: Record<Screen, number> = {
    menu: 0,
    fulfillment: 1,
    zone: 2,
    timeslot: fulfillmentType === 'delivery' ? 3 : 2,
    payment: fulfillmentType === 'delivery' ? 4 : 3,
    customerInfo: fulfillmentType === 'delivery' ? 5 : 4,
    confirmation: steps.length - 1,
  }
  return { steps, currentIndex: indexByScreen[screen] }
}

export interface OrderProgressProps {
  steps: string[]
  currentIndex: number
}

export function OrderProgress({ steps, currentIndex }: OrderProgressProps) {
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex gap-[3px]" aria-hidden="true">
        {steps.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? 'bg-primary' : 'bg-surface-container-high'}`} />
        ))}
      </div>
      <span className="text-label-sm text-on-surface-variant">
        Step {currentIndex + 1} of {steps.length} · {steps[currentIndex]}
      </span>
    </div>
  )
}
