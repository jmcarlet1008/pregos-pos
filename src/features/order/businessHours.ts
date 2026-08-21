import type { BusinessSettings } from '../../db'

export type OpenState =
  | { open: true }
  | { open: false; reason: 'manual' }
  | { open: false; reason: 'before_open'; opensAt: string; closesAt: string }
  | { open: false; reason: 'after_close'; closesAt: string }

function parseTimeToday(hhmm: string, now: Date): Date {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const result = new Date(now)
  result.setHours(hours, minutes, 0, 0)
  return result
}

/**
 * Whether /order should show the ordering flow right now: the manual
 * accepting_orders_today switch takes priority (an explicit staff override — early
 * closure, holiday, out of stock), then the scheduled delivery_start_time/end_time
 * window. Re-run this against a fresh `now` periodically (see OrderPage's interval) so
 * a window boundary passing closes the page even without a BusinessSettings change to
 * react to via Realtime.
 */
export function evaluateOpenState(settings: BusinessSettings, now: Date = new Date()): OpenState {
  if (!settings.accepting_orders_today) return { open: false, reason: 'manual' }

  const opensAt = settings.delivery_start_time
  const closesAt = settings.delivery_end_time
  const opens = parseTimeToday(opensAt, now)
  const closes = parseTimeToday(closesAt, now)

  if (now < opens) return { open: false, reason: 'before_open', opensAt, closesAt }
  if (now > closes) return { open: false, reason: 'after_close', closesAt }
  return { open: true }
}

/**
 * Today's "HH:MM" slots from delivery_start_time to delivery_end_time, stepping by
 * delivery_slot_interval_minutes, excluding any slot that's already in the past —
 * a customer shouldn't be offered a pickup/delivery time that's already gone by.
 */
export function generateTimeSlots(settings: BusinessSettings, now: Date = new Date()): string[] {
  const slots: string[] = []
  const cursor = parseTimeToday(settings.delivery_start_time, now)
  const end = parseTimeToday(settings.delivery_end_time, now)
  const stepMinutes = Math.max(5, settings.delivery_slot_interval_minutes)

  while (cursor <= end) {
    if (cursor >= now) {
      const hh = String(cursor.getHours()).padStart(2, '0')
      const mm = String(cursor.getMinutes()).padStart(2, '0')
      slots.push(`${hh}:${mm}`)
    }
    cursor.setMinutes(cursor.getMinutes() + stepMinutes)
  }
  return slots
}

/** Combines a chosen "HH:MM" slot with today's date into a full ISO datetime, for Order.requested_time. */
export function slotToIso(hhmm: string, now: Date = new Date()): string {
  return parseTimeToday(hhmm, now).toISOString()
}

export function formatSlotLabel(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`
}
