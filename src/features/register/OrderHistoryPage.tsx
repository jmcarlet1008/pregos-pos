import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type OrderStatus, type PaymentMethod } from '../../db'
import { Button, Input } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { addDays, endOfDay, orderTimestamp, startOfDay, toDateInputValue } from '../../lib/dateRange'
import { buildOrderHistoryCsv, downloadCsv, filterOrderHistory, type PaymentFilter, type StatusFilter } from './orderHistoryData'
import { ReceiptScreen } from './ReceiptScreen'

type DatePreset = 'today' | '7d' | '30d' | 'custom'

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
]

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
]

const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
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

function FilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-xs" role="tablist" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={[
            'touch-target shrink-0 whitespace-nowrap rounded-full px-md text-body-md font-body font-bold transition-colors',
            value === opt.value
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function OrderHistoryPage() {
  const [preset, setPreset] = useState<DatePreset>('today')
  const [rangeStart, setRangeStart] = useState<Date>(() => startOfDay(new Date()))
  const [rangeEnd, setRangeEnd] = useState<Date>(() => endOfDay(new Date()))
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [search, setSearch] = useState('')
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)

  // completed/voided only — 'active' (in-progress/held) orders have no place in History.
  const orders = useLiveQuery(() => db.orders.where('status').notEqual('active').toArray()) ?? []
  const payments = useLiveQuery(() => db.payments.toArray()) ?? []
  const users = useLiveQuery(() => db.users.toArray()) ?? []
  const orderLines = useLiveQuery(() => db.orderLines.toArray()) ?? []

  const paymentByOrder = new Map(payments.map((p) => [p.order_id, p]))
  const userById = new Map(users.map((u) => [u.id, u]))

  function applyPreset(next: DatePreset) {
    setPreset(next)
    const today = new Date()
    if (next === 'today') {
      setRangeStart(startOfDay(today))
      setRangeEnd(endOfDay(today))
    } else if (next === '7d') {
      setRangeStart(startOfDay(addDays(today, -6)))
      setRangeEnd(endOfDay(today))
    } else if (next === '30d') {
      setRangeStart(startOfDay(addDays(today, -29)))
      setRangeEnd(endOfDay(today))
    }
  }

  const filtered = filterOrderHistory(orders, rangeStart, rangeEnd, statusFilter, paymentFilter, search, paymentByOrder)

  const completedInRange = filtered.filter((o) => o.status === 'completed')
  const grossSalesInRange = completedInRange.reduce((sum, o) => sum + o.total, 0)
  const summaryLabel = preset === 'today' ? 'Today' : `${toDateInputValue(rangeStart)} – ${toDateInputValue(rangeEnd)}`

  function handleExport() {
    // Exports exactly what's on screen — same filtered set the table renders — plus
    // full line-item detail, so the file matches what was reviewed before extracting.
    const csv = buildOrderHistoryCsv(filtered, payments, users, orderLines)
    downloadCsv(`pregos-order-history_${toDateInputValue(rangeStart)}_to_${toDateInputValue(rangeEnd)}.csv`, csv)
  }

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
      <div className="grid grid-cols-2 gap-sm @sm:max-w-[28rem]">
        <SummaryCard label={`Orders (${summaryLabel})`} value={String(completedInRange.length)} />
        <SummaryCard label={`Gross Sales (${summaryLabel})`} value={formatCurrency(grossSalesInRange)} />
      </div>

      <div className="flex flex-wrap items-end gap-sm">
        <FilterTabs label="Date range preset" options={DATE_PRESETS} value={preset} onChange={applyPreset} />
        <Input
          label="From"
          type="date"
          value={toDateInputValue(rangeStart)}
          onChange={(e) => {
            if (!e.target.value) return
            setPreset('custom')
            setRangeStart(startOfDay(new Date(`${e.target.value}T00:00:00`)))
          }}
          className="w-40"
        />
        <Input
          label="To"
          type="date"
          value={toDateInputValue(rangeEnd)}
          onChange={(e) => {
            if (!e.target.value) return
            setPreset('custom')
            setRangeEnd(endOfDay(new Date(`${e.target.value}T00:00:00`)))
          }}
          className="w-40"
        />
        <Button variant="secondary" onClick={handleExport} disabled={filtered.length === 0} className="ml-auto">
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <FilterTabs label="Filter by status" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <FilterTabs label="Filter by payment method" options={PAYMENT_FILTERS} value={paymentFilter} onChange={setPaymentFilter} />

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
            {orders.length === 0 ? 'No orders yet.' : 'No orders match your filters.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-body-md">
            <thead className="sticky top-0 bg-surface-container text-label-bold text-on-surface-variant">
              <tr>
                <th className="px-sm py-xs">Order #</th>
                <th className="px-sm py-xs">Date</th>
                <th className="px-sm py-xs">Time</th>
                <th className="px-sm py-xs">Cashier</th>
                <th className="px-sm py-xs">Payment</th>
                <th className="px-sm py-xs text-right">Total</th>
                <th className="px-sm py-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const ts = new Date(orderTimestamp(order))
                const cashierName = order.user_id ? (userById.get(order.user_id)?.name ?? '—') : '—'
                const paymentMethod: PaymentMethod | null = paymentByOrder.get(order.id)?.method ?? null
                return (
                  <tr
                    key={order.id}
                    onClick={() => setViewingOrderId(order.id)}
                    className="cursor-pointer border-t border-surface-dim hover:bg-surface-container"
                  >
                    <td className="px-sm py-xs font-bold text-on-surface">#{order.order_number ?? '—'}</td>
                    <td className="px-sm py-xs text-on-surface-variant">{ts.toLocaleDateString('en-PH')}</td>
                    <td className="px-sm py-xs text-on-surface-variant">
                      {ts.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="px-sm py-xs text-on-surface-variant">{cashierName}</td>
                    <td className="px-sm py-xs text-on-surface-variant">
                      {paymentMethod === 'gcash' ? 'GCash' : paymentMethod === 'cash' ? 'Cash' : '—'}
                    </td>
                    <td className="px-sm py-xs text-right font-bold text-on-surface">{formatCurrency(order.total)}</td>
                    <td className="px-sm py-xs">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
