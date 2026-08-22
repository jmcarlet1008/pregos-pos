import {
  DEFAULT_AVERAGE_PREP_TIME_MINUTES,
  type BusinessSettings,
  type DeliveryAddress,
  type FulfillmentType,
  type KitchenStatus,
  type Order,
  type OrderChannel,
} from '../db'

/**
 * Shared kitchen-workflow logic — pure, side-effect-free derivations over Order/
 * BusinessSettings. Deliberately lives outside src/features/{order,kitchen,fulfillment}/
 * so all three of those routes' independent lazy Rollup chunks (see vite.config.ts's
 * manualChunks) can import it without creating a cross-feature-folder dependency, and so
 * Register (a fourth, non-lazy consumer) can too. See src/db/schema.ts's KitchenStatus
 * doc comment for the full status lifecycle this module implements.
 */

export type FulfillmentKind = 'walk-in' | 'pickup' | 'delivery'

/** 🟡 "soon" starts this many minutes before start-by time; past/now is always 🔴 urgent. */
export const SOON_THRESHOLD_MINUTES = 20

type OrderForKind = Pick<Order, 'channel' | 'fulfillment_type'>

/** Derives the customer-facing fulfillment kind — there's no 'walk-in' FulfillmentType; a
 *  walk-in is any in-store (dine-in) order, which always has fulfillment_type: null. */
export function getFulfillmentKind(order: OrderForKind): FulfillmentKind {
  if (order.channel === 'in_store') return 'walk-in'
  return order.fulfillment_type === 'delivery' ? 'delivery' : 'pickup'
}

export interface InitialKitchenStatusInput {
  channel: OrderChannel
  fulfillmentType: FulfillmentType | null
  /** Only consulted when fulfillmentType === 'delivery'; ignored otherwise. */
  zoneAutoRoute: boolean | null
}

/**
 * The one place that decides where a brand-new order enters the workflow. Dine-in
 * (Register, confirmed by payment) and online Pickup/auto-route Delivery all auto-queue
 * straight into 'preparing'; only a manual-confirmation delivery zone order waits at
 * 'pending_confirmation' for a staff member to send it through.
 */
export function getInitialKitchenStatus(input: InitialKitchenStatusInput): KitchenStatus {
  if (input.channel === 'in_store') return 'preparing'
  if (input.fulfillmentType === 'delivery' && input.zoneAutoRoute === false) return 'pending_confirmation'
  return 'preparing'
}

/** Where 'ready' leads next, branching by fulfillment kind — consumed by the /fulfillment hand-off screen. */
export function getNextStatusAfterReady(kind: FulfillmentKind): KitchenStatus {
  if (kind === 'walk-in') return 'served'
  if (kind === 'pickup') return 'picked_up'
  return 'out_for_delivery'
}

type OrderForPrep = Pick<Order, 'prep_time_override_minutes'>
type SettingsForPrep = Pick<BusinessSettings, 'average_prep_time_minutes'>

/** order.prep_time_override_minutes wins when a staff member set one; otherwise the shop-wide average. */
export function getEffectivePrepMinutes(order: OrderForPrep, settings: SettingsForPrep | null | undefined): number {
  return order.prep_time_override_minutes ?? settings?.average_prep_time_minutes ?? DEFAULT_AVERAGE_PREP_TIME_MINUTES
}

type OrderForStartBy = OrderForPrep & Pick<Order, 'requested_time'>

/** requested_time minus effective prep minutes. Null for walk-ins (no requested_time at all). */
export function getStartByDate(order: OrderForStartBy, settings: SettingsForPrep | null | undefined): Date | null {
  if (!order.requested_time) return null
  const prepMs = getEffectivePrepMinutes(order, settings) * 60_000
  return new Date(new Date(order.requested_time).getTime() - prepMs)
}

export type Urgency = 'urgent' | 'soon' | 'ok'

type OrderForUrgency = OrderForStartBy & OrderForKind

/** Walk-ins are always urgent (the customer is at the counter); everyone else is judged by start-by time. */
export function getUrgency(order: OrderForUrgency, settings: SettingsForPrep | null | undefined, now: Date): Urgency {
  if (getFulfillmentKind(order) === 'walk-in') return 'urgent'
  const startBy = getStartByDate(order, settings)
  if (!startBy) return 'urgent' // shouldn't happen for a non-walk-in order, but fail toward visibility
  const minutesUntil = (startBy.getTime() - now.getTime()) / 60_000
  if (minutesUntil <= 0) return 'urgent'
  if (minutesUntil <= SOON_THRESHOLD_MINUTES) return 'soon'
  return 'ok'
}

type OrderForSort = OrderForUrgency & Pick<Order, 'queue_priority' | 'created_at'>

/**
 * The single numeric ascending sort key driving Preparing's order (lower sorts first).
 * A manual queue_priority always wins. Otherwise: walk-ins sort by when they arrived
 * (FIFO — they have no requested_time to compute a start-by from); everyone else sorts
 * by computed start-by time (soonest first).
 */
export function computeSortEpoch(order: OrderForSort, settings: SettingsForPrep | null | undefined): number {
  if (order.queue_priority != null) return order.queue_priority
  if (getFulfillmentKind(order) === 'walk-in') return new Date(order.created_at).getTime()
  const startBy = getStartByDate(order, settings)
  return startBy ? startBy.getTime() : new Date(order.created_at).getTime()
}

/** Renders either delivery-address shape (see schema.ts's DeliveryAddress) to one display line. */
export function formatDeliveryAddress(address: DeliveryAddress): string {
  if (address.type === 'structured') {
    const parts = [address.block && `Blk ${address.block}`, address.lot && `Lot ${address.lot}`, address.phase && `Phase ${address.phase}`]
      .filter(Boolean)
      .join(', ')
    return [parts, address.street].filter(Boolean).join(', ')
  }
  return address.area
}
