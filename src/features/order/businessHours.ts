import type { BusinessSettings } from '../../db'

export type OpenState = { open: true } | { open: false; reason: 'manual' }

function parseTimeToday(hhmm: string, now: Date): Date {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const result = new Date(now)
  result.setHours(hours, minutes, 0, 0)
  return result
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Whether /order should show the ordering flow right now. This reflects only the
 * manual accepting_orders_today switch — an explicit staff override (early closure,
 * holiday, out of stock, or "we're open for advance orders before delivery starts").
 * It deliberately does NOT depend on delivery_start_time/end_time at all: that window
 * only constrains which pickup/delivery time slot a customer may choose (see
 * generateTimeSlots/slotToIso below), not whether the site can be used. A shop can
 * flip this on hours before its delivery window opens to start collecting advance
 * orders for later that day.
 */
export function evaluateOpenState(settings: BusinessSettings): OpenState {
  return settings.accepting_orders_today ? { open: true } : { open: false, reason: 'manual' }
}

/**
 * Today's "HH:MM" slots from delivery_start_time to delivery_end_time, stepping by
 * delivery_slot_interval_minutes, excluding any slot that's already in the past —
 * a customer shouldn't be offered a pickup/delivery time that's already gone by.
 *
 * For an overnight window (see evaluateOpenState), the slot range anchors to whichever
 * calendar day's window is actually active right now — yesterday's opening through this
 * morning's close, or today's opening through tomorrow morning's close — so slots keep
 * making sense right across the midnight boundary.
 */
export function generateTimeSlots(settings: BusinessSettings, now: Date = new Date()): string[] {
  const slots: string[] = []
  const opensAt = settings.delivery_start_time
  const closesAt = settings.delivery_end_time
  const overnight = closesAt <= opensAt

  const cursor = parseTimeToday(opensAt, now)
  let end = parseTimeToday(closesAt, now)

  if (overnight) {
    if (now <= end) {
      cursor.setTime(addDays(cursor, -1).getTime()) // still yesterday's window
    } else {
      end = addDays(end, 1) // today's window, closes tomorrow morning
    }
  }

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

/**
 * Combines a chosen "HH:MM" slot with a calendar date into a full ISO datetime, for
 * Order.requested_time. generateTimeSlots already excludes any slot earlier than `now`,
 * so the only way today's version of this time-of-day lands before `now` is an
 * overnight-window slot that's actually for tomorrow (e.g. it's 11pm and the customer
 * picked 00:30) — bump those to the next calendar day.
 */
export function slotToIso(hhmm: string, now: Date = new Date()): string {
  const candidate = parseTimeToday(hhmm, now)
  return (candidate < now ? addDays(candidate, 1) : candidate).toISOString()
}

export function formatSlotLabel(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`
}
