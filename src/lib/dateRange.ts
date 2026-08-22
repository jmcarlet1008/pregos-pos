import type { Order } from '../db'

export function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Completed orders record `completed_at` once and never overwrite it, unlike `updated_at` — this is the sale timestamp. */
export function orderTimestamp(order: Order): string {
  return order.completed_at ?? order.updated_at
}

export function filterOrdersInRange(orders: Order[], start: Date, end: Date): Order[] {
  const startMs = start.getTime()
  const endMs = end.getTime()
  return orders.filter((o) => {
    const t = new Date(orderTimestamp(o)).getTime()
    return t >= startMs && t <= endMs
  })
}
