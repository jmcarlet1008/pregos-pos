import type { Order, OrderLine, Payment, PaymentMethod, User } from '../../db'

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

export interface RangeStats {
  grossSales: number
  orderCount: number
  avgTicket: number
}

export function computeStats(orders: Order[]): RangeStats {
  const grossSales = orders.reduce((sum, o) => sum + o.total, 0)
  const orderCount = orders.length
  return { grossSales, orderCount, avgTicket: orderCount ? grossSales / orderCount : 0 }
}

/** Percent change of current vs previous. Null means "no baseline" (previous was zero) — render as n/a, not ±∞ or 0%. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export interface KpiData {
  today: RangeStats
  yesterday: RangeStats
}

export function computeKpiData(orders: Order[], now: Date): KpiData {
  return {
    today: computeStats(filterOrdersInRange(orders, startOfDay(now), endOfDay(now))),
    yesterday: computeStats(filterOrdersInRange(orders, startOfDay(addDays(now, -1)), endOfDay(addDays(now, -1)))),
  }
}

export type ChartMode = 'today' | 'week'

export interface ChartBucket {
  label: string
  sales: number
}

function formatHourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour < 12 ? 'a' : 'p'
  return `${h}${suffix}`
}

export function computeHourlyBuckets(orders: Order[], day: Date): ChartBucket[] {
  const todays = filterOrdersInRange(orders, startOfDay(day), endOfDay(day))
  const buckets = Array.from({ length: 24 }, () => 0)
  for (const o of todays) {
    const hour = new Date(orderTimestamp(o)).getHours()
    buckets[hour] += o.total
  }
  return buckets.map((sales, hour) => ({ label: formatHourLabel(hour), sales }))
}

export function computeWeeklyBuckets(orders: Order[], now: Date): ChartBucket[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(now, i - 6)
    const dayOrders = filterOrdersInRange(orders, startOfDay(day), endOfDay(day))
    return { label: day.toLocaleDateString('en-PH', { weekday: 'short' }), sales: computeStats(dayOrders).grossSales }
  })
}

export interface TopItem {
  name: string
  quantity: number
  revenue: number
}

export function computeTopItems(orderIds: Set<string>, orderLines: OrderLine[], limit = 8): TopItem[] {
  const byName = new Map<string, TopItem>()
  for (const line of orderLines) {
    if (!orderIds.has(line.order_id)) continue
    const existing = byName.get(line.product_name) ?? { name: line.product_name, quantity: 0, revenue: 0 }
    existing.quantity += line.quantity
    existing.revenue += line.line_total
    byName.set(line.product_name, existing)
  }
  return [...byName.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

export interface PaymentSplit {
  cash: { amount: number; count: number }
  gcash: { amount: number; count: number }
}

export function computePaymentSplit(orders: Order[], payments: Payment[]): PaymentSplit {
  const paymentByOrder = new Map(payments.map((p) => [p.order_id, p]))
  const split: PaymentSplit = { cash: { amount: 0, count: 0 }, gcash: { amount: 0, count: 0 } }
  for (const o of orders) {
    const payment = paymentByOrder.get(o.id)
    if (!payment) continue
    split[payment.method].amount += o.total
    split[payment.method].count += 1
  }
  return split
}

/** Reporting-only estimate of the VAT already baked into VAT-inclusive prices — never shown at checkout, see plan.md. */
export function vatPortion(total: number): number {
  return (total * 12) / 112
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', gcash: 'GCash' }

export function buildOrdersCsv(orders: Order[], payments: Payment[], users: User[]): string {
  const paymentByOrder = new Map(payments.map((p) => [p.order_id, p]))
  const userById = new Map(users.map((u) => [u.id, u]))
  const header = ['Order #', 'Date', 'Time', 'Cashier', 'Payment Method', 'Total', 'VAT Portion (ref. only)']

  const rows = orders
    .slice()
    .sort((a, b) => orderTimestamp(a).localeCompare(orderTimestamp(b)))
    .map((o) => {
      const ts = new Date(orderTimestamp(o))
      const payment = paymentByOrder.get(o.id)
      const cashier = o.user_id ? userById.get(o.user_id) : undefined
      return [
        String(o.order_number),
        ts.toLocaleDateString('en-PH'),
        ts.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
        cashier?.name ?? '—',
        payment ? PAYMENT_LABEL[payment.method] : '—',
        o.total.toFixed(2),
        vatPortion(o.total).toFixed(2),
      ]
    })

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
