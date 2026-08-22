import type { Order, OrderLine, OrderStatus, Payment, PaymentMethod, User } from '../../db'
import { csvCell, downloadCsv } from '../../lib/csv'
import { filterOrdersInRange, orderTimestamp } from '../../lib/dateRange'

export type StatusFilter = 'all' | OrderStatus
export type PaymentFilter = 'all' | PaymentMethod

const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', gcash: 'GCash' }

/**
 * Narrows the full order set down to what History should list: within the selected
 * date range, matching the status/payment/search filters, newest first. Only ever
 * called with non-'active' orders (RegisterPage.tsx's History tab only shows
 * completed/voided) — see loadHistoryOrders below.
 */
export function filterOrderHistory(
  orders: Order[],
  start: Date,
  end: Date,
  statusFilter: StatusFilter,
  paymentFilter: PaymentFilter,
  searchTerm: string,
  paymentByOrder: Map<string, Payment>,
): Order[] {
  const term = searchTerm.trim()
  return filterOrdersInRange(orders, start, end)
    .filter((o) => statusFilter === 'all' || o.status === statusFilter)
    .filter((o) => paymentFilter === 'all' || paymentByOrder.get(o.id)?.method === paymentFilter)
    .filter((o) => !term || String(o.order_number ?? '').includes(term))
    .sort((a, b) => orderTimestamp(b).localeCompare(orderTimestamp(a)))
}

/**
 * One row per order, for the History extract — order number, timestamp, status,
 * cashier, payment method + detail (cash tendered/change, or GCash reference), a
 * summary of what was ordered, and the total. Mirrors analyticsData.ts's
 * buildOrdersCsv shape/conventions but scoped to what History shows (all statuses in
 * the filtered set, not just completed; no BIR columns — that reporting lives in
 * Analytics).
 */
export function buildOrderHistoryCsv(orders: Order[], payments: Payment[], users: User[], orderLines: OrderLine[]): string {
  const paymentByOrder = new Map(payments.map((p) => [p.order_id, p]))
  const userById = new Map(users.map((u) => [u.id, u]))
  const linesByOrder = new Map<string, OrderLine[]>()
  for (const line of orderLines) {
    const existing = linesByOrder.get(line.order_id)
    if (existing) existing.push(line)
    else linesByOrder.set(line.order_id, [line])
  }

  const header = ['Order #', 'Date', 'Time', 'Status', 'Cashier', 'Payment Method', 'Payment Detail', 'Items', 'Total']

  const rows = orders
    .slice()
    .sort((a, b) => orderTimestamp(a).localeCompare(orderTimestamp(b)))
    .map((o) => {
      const ts = new Date(orderTimestamp(o))
      const payment = paymentByOrder.get(o.id)
      const cashier = o.user_id ? userById.get(o.user_id) : undefined
      const items = (linesByOrder.get(o.id) ?? []).map((l) => `${l.quantity}x ${l.product_name}`).join('; ')
      const paymentDetail = !payment
        ? ''
        : payment.method === 'cash'
          ? `Tendered ${payment.amount_tendered.toFixed(2)}, Change ${payment.change.toFixed(2)}`
          : `Ref# ${payment.gcash_reference ?? '—'}`
      return [
        String(o.order_number ?? '—'),
        ts.toLocaleDateString('en-PH'),
        ts.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
        o.status === 'voided' ? 'Voided' : 'Completed',
        cashier?.name ?? '—',
        payment ? PAYMENT_LABEL[payment.method] : '—',
        paymentDetail,
        items,
        o.total.toFixed(2),
      ]
    })

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export { downloadCsv }
