import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Order, type OrderStatus, type PaymentMethod } from '../../db'
import { Input } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { ReceiptScreen } from './ReceiptScreen'

interface HistoryRow extends Order {
  cashierName: string
  paymentMethod: PaymentMethod | null
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function orderTime(order: Order): string {
  return order.completed_at ?? order.updated_at
}

async function loadTodaysOrders(): Promise<HistoryRow[]> {
  const now = new Date()
  const all = await db.orders.toArray()
  const todays = all.filter(
    (o) => o.status !== 'active' && isSameLocalDay(new Date(orderTime(o)), now),
  )

  const rows = await Promise.all(
    todays.map(async (order) => {
      const payment = await db.payments.where('order_id').equals(order.id).last()
      const cashier = order.user_id ? await db.users.get(order.user_id) : undefined
      return {
        ...order,
        cashierName: cashier?.name ?? '—',
        paymentMethod: payment?.method ?? null,
      }
    }),
  )

  return rows.sort((a, b) => orderTime(b).localeCompare(orderTime(a)))
}

type StatusFilter = 'all' | OrderStatus

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
]

function StatusBadge({ status }: { status: OrderStatus }) {
  if (status === 'voided') {
    return (
      <span className="rounded-full bg-error-container px-xs py-[2px] text-label-sm font-bold text-on-error-container">
        Voided
      </span>
    )
  }
  return (
    <span className="rounded-full bg-surface-container-high px-xs py-[2px] text-label-sm font-bold text-on-surface">
      Completed
    </span>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px] rounded-lg border border-surface-dim bg-surface-container-lowest px-md py-sm">
      <span className="text-label-sm text-on-surface-variant">{label}</span>
      <span className="text-headline-md text-on-surface">{value}</span>
    </div>
  )
}

export function OrderHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)

  const orders = useLiveQuery(loadTodaysOrders, []) ?? []

  const completedToday = orders.filter((o) => o.status === 'completed')
  const grossSalesToday = completedToday.reduce((sum, o) => sum + o.total, 0)

  const searchTerm = search.trim()
  const filtered = orders
    .filter((o) => statusFilter === 'all' || o.status === statusFilter)
    .filter((o) => !searchTerm || String(o.order_number).includes(searchTerm))

  if (viewingOrderId) {
    return (
      <ReceiptScreen
        orderId={viewingOrderId}
        onDone={() => setViewingOrderId(null)}
        doneLabel="← Back to History"
        printLabel="Reprint Receipt"
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-sm">
      <div className="grid grid-cols-2 gap-sm @sm:max-w-md">
        <SummaryCard label="Orders Today" value={String(completedToday.length)} />
        <SummaryCard label="Gross Sales Today" value={formatCurrency(grossSalesToday)} />
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <div className="flex gap-xs" role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
              className={[
                'touch-target shrink-0 whitespace-nowrap rounded-full px-md text-body-md font-body font-bold transition-colors',
                statusFilter === f.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #…"
          aria-label="Search by order number"
          className="w-48"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-surface-dim bg-surface-container-lowest">
        {filtered.length === 0 ? (
          <p className="p-md text-center text-body-md text-on-surface-variant">
            {orders.length === 0 ? 'No orders yet today.' : 'No orders match your search.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-body-md">
            <thead className="sticky top-0 bg-surface-container text-label-bold text-on-surface-variant">
              <tr>
                <th className="px-sm py-xs">Order #</th>
                <th className="px-sm py-xs">Time</th>
                <th className="px-sm py-xs">Cashier</th>
                <th className="px-sm py-xs">Payment</th>
                <th className="px-sm py-xs text-right">Total</th>
                <th className="px-sm py-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setViewingOrderId(order.id)}
                  className="cursor-pointer border-t border-surface-dim hover:bg-surface-container"
                >
                  <td className="px-sm py-xs font-bold text-on-surface">#{order.order_number}</td>
                  <td className="px-sm py-xs text-on-surface-variant">
                    {new Date(orderTime(order)).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-sm py-xs text-on-surface-variant">{order.cashierName}</td>
                  <td className="px-sm py-xs text-on-surface-variant">
                    {order.paymentMethod === 'gcash' ? 'GCash' : order.paymentMethod === 'cash' ? 'Cash' : '—'}
                  </td>
                  <td className="px-sm py-xs text-right font-bold text-on-surface">{formatCurrency(order.total)}</td>
                  <td className="px-sm py-xs">
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
