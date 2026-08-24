import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, FilterGroup, FilterSelect, SortableList } from '../../components/ui'
import { BUSINESS_SETTINGS_ID, db, type KitchenStatus, type Order } from '../../db'
import { formatCurrency } from '../../lib/currency'
import { addDays, endOfDay, startOfDay, toDateInputValue } from '../../lib/dateRange'
import {
  CHANNEL_LABEL,
  computeDroppedPriority,
  computeSortEpoch,
  FULFILLMENT_LABEL,
  getFulfillmentKind,
  KITCHEN_STATUS_LABEL,
} from '../../lib/orderWorkflow'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { ROUTES } from '../../routes'
import { useAuth } from '../auth/AuthContext'
import {
  computeChannelFulfillmentBreakdown,
  computeStats,
  filterByChannelAndFulfillment,
  type ChannelFilter,
  type FulfillmentFilter,
} from '../analytics/analyticsData'
import { ChannelFulfillmentBreakdownPanel } from '../analytics/ChannelFulfillmentBreakdownPanel'
import { ChannelFulfillmentFilter } from '../analytics/ChannelFulfillmentFilter'
import { KitchenOrderCard } from '../kitchen/KitchenOrderCard'
import { AddManualOrderFlow } from './AddManualOrderFlow'
import { CancelOrderModal } from './CancelOrderModal'
import { EditOrderItemsFlow } from './EditOrderItemsFlow'
import { EditRequestedTimeModal } from './EditRequestedTimeModal'
import { setQueuePriority, useOrderManagementQueue, type OrderManagementBundle } from './orderManagementSupabaseData'

type DatePreset = 'today' | '7d' | '30d' | 'custom'
const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
]

// Buckets the user asked for — 'completed_fulfillment' combines the three terminal
// fulfillment-specific completions into the single "Served/Picked Up/Delivered" filter
// tab. 'new' (the pre-payment, cart-still-being-built state) is deliberately omitted —
// it's momentary and Register-only, never useful to filter Order Management by.
type KitchenStatusFilter = 'all' | 'pending_confirmation' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed_fulfillment' | 'cancelled'
const KITCHEN_STATUS_FILTERS: { value: KitchenStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_confirmation', label: 'Pending Confirmation' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'completed_fulfillment', label: 'Served/Picked Up/Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

function matchesKitchenStatusFilter(status: KitchenStatus, filter: KitchenStatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'completed_fulfillment') return status === 'served' || status === 'picked_up' || status === 'delivered'
  return status === filter
}

/** Dine-in is excluded — by the time it's in the kitchen queue it's already a paid,
 *  completed Register sale (see EditOrderItemsFlow.tsx/applyOrderItemEdit's doc
 *  comments for why). Only still-editable while the kitchen hasn't started ignoring
 *  further changes, i.e. before Ready. */
function isItemEditable(order: Order): boolean {
  return (
    order.channel !== 'in_store' &&
    (order.kitchen_status === 'pending_confirmation' || order.kitchen_status === 'preparing')
  )
}

const KITCHEN_STATUS_BADGE_CLASSES: Record<KitchenStatus, string> = {
  new: 'bg-surface-container-high text-on-surface',
  pending_confirmation: 'bg-warning-container text-on-warning-container',
  preparing: 'bg-primary-container text-on-primary-container',
  ready: 'bg-success-container text-on-success-container',
  served: 'bg-surface-container-high text-on-surface',
  picked_up: 'bg-surface-container-high text-on-surface',
  out_for_delivery: 'bg-secondary-container text-on-secondary-container',
  delivered: 'bg-surface-container-high text-on-surface',
  cancelled: 'bg-error-container text-on-error-container',
}

function KitchenStatusBadge({ status }: { status: KitchenStatus }) {
  return (
    <span className={`rounded-full px-xs py-[2px] text-label-sm font-bold ${KITCHEN_STATUS_BADGE_CLASSES[status]}`}>
      {KITCHEN_STATUS_LABEL[status]}
    </span>
  )
}

/** Same local pill-tab pattern OrderHistoryPage.tsx/ChannelFulfillmentFilter.tsx already
 *  use — duplicated per this codebase's per-feature-folder convention rather than shared. */
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
    <div className="flex flex-wrap gap-xs" role="tablist" aria-label={label}>
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

function useClock(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/**
 * Manager-only dashboard for overseeing and manually adjusting every order across every
 * channel — see src/db/schema.ts's KitchenStatus/queue_priority doc comments, which
 * anticipated this screen by name. Sits inside the authenticated, Dexie-booted app
 * shell (unlike /kitchen, /fulfillment, /order), but its order data/mutations talk
 * directly to Supabase — see orderManagementSupabaseData.ts's header comment for why.
 */
export function OrderManagementPage() {
  const { user } = useAuth()
  const settings = useLiveQuery(() => db.businessSettings.get(BUSINESS_SETTINGS_ID))
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const products = useLiveQuery(() => db.products.toArray()) ?? []
  const modifierOptions = useLiveQuery(() => db.modifierOptions.toArray()) ?? []
  const now = useClock(30_000)

  const [preset, setPreset] = useState<DatePreset>('today')
  const [rangeStart, setRangeStart] = useState<Date>(() => startOfDay(new Date()))
  const [rangeEnd, setRangeEnd] = useState<Date>(() => endOfDay(new Date()))
  const [statusFilter, setStatusFilter] = useState<KitchenStatusFilter>('all')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>('all')

  const [addingManualOrder, setAddingManualOrder] = useState(false)
  const [editingTimeOrder, setEditingTimeOrder] = useState<Order | null>(null)
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null)
  const [editingItemsOrderId, setEditingItemsOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { bundles, connectionStatus, patchOrder } = useOrderManagementQueue({ from: rangeStart, to: rangeEnd })
  const bundleList = useMemo(() => Array.from(bundles.values()), [bundles])

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

  async function runAction(action: () => Promise<void>) {
    try {
      await action()
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  // Full order list: kitchen_status + channel/fulfillment filters (date range is already
  // applied server-side by useOrderManagementQueue), most-recent-first.
  const channelFilteredIds = useMemo(
    () => new Set(filterByChannelAndFulfillment(bundleList.map((b) => b.order), channelFilter, fulfillmentFilter).map((o) => o.id)),
    [bundleList, channelFilter, fulfillmentFilter],
  )
  const filteredBundles = useMemo(
    () =>
      bundleList
        .filter((b) => channelFilteredIds.has(b.order.id) && matchesKitchenStatusFilter(b.order.kitchen_status, statusFilter))
        .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime()),
    [bundleList, channelFilteredIds, statusFilter],
  )

  // Analytics surfacing: the full range set (completed orders only — real committed
  // sales, same scope AnalyticsPage itself uses), independent of the list's own
  // kitchen_status/channel/fulfillment filters — a stable at-a-glance summary for
  // whatever date range is selected. No sync lag, unlike /analytics: this reads the
  // same direct-Supabase set the order list above does.
  const completedOrders = useMemo(() => bundleList.map((b) => b.order).filter((o) => o.status === 'completed'), [bundleList])
  const channelFulfillmentBreakdown = useMemo(() => computeChannelFulfillmentBreakdown(completedOrders), [completedOrders])
  const rangeStats = useMemo(() => computeStats(completedOrders), [completedOrders])

  // Preparing-queue reorder — same walk-in/others split and drag math as /kitchen, so a
  // reorder here writes the literal same queue_priority via the literal same function.
  const preparing = useMemo(() => bundleList.filter((b) => b.order.kitchen_status === 'preparing'), [bundleList])
  const walkIns = useMemo(() => {
    if (!settings) return []
    return preparing
      .filter((b) => getFulfillmentKind(b.order) === 'walk-in')
      .sort((a, b) => computeSortEpoch(a.order, settings) - computeSortEpoch(b.order, settings))
  }, [preparing, settings])
  const others = useMemo(() => {
    if (!settings) return []
    return preparing
      .filter((b) => getFulfillmentKind(b.order) !== 'walk-in')
      .sort((a, b) => computeSortEpoch(a.order, settings) - computeSortEpoch(b.order, settings))
  }, [preparing, settings])

  function handleReorderGroup(group: OrderManagementBundle[]) {
    return (orderedIds: string[], activeId: string) => {
      if (!settings) return
      const priority = computeDroppedPriority(group, orderedIds, activeId, settings)
      patchOrder(activeId, { queue_priority: priority }) // optimistic — avoids a visible snap-back while the write is in flight
      void runAction(() => setQueuePriority(activeId, priority))
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-md">
        <p className="text-body-lg text-on-surface-variant">Order Management is temporarily unavailable.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex items-center gap-sm">
          <h1 className="text-headline-lg text-on-surface">Order Management</h1>
          <span
            className={['flex items-center gap-xs text-label-bold', connectionStatus === 'live' ? 'text-success' : 'text-warning'].join(
              ' ',
            )}
          >
            <span>●</span>
            {connectionStatus === 'live' ? 'Live' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
          </span>
        </div>
        <div className="flex items-center gap-sm">
          <Link to={ROUTES.analytics} className="text-body-md font-bold text-primary hover:underline">
            View full Analytics →
          </Link>
          <Button variant="primary" onClick={() => setAddingManualOrder(true)}>
            📞 Add Manual Order
          </Button>
        </div>
      </div>

      {actionError && <div className="rounded-md bg-error-container px-md py-sm text-body-md text-on-error-container">{actionError}</div>}

      <ChannelFulfillmentBreakdownPanel breakdown={channelFulfillmentBreakdown} totals={rangeStats} />

      <div className="flex flex-wrap items-end gap-sm">
        <FilterTabs label="Date range preset" options={DATE_PRESETS} value={preset} onChange={applyPreset} />
        <input
          type="date"
          aria-label="From date"
          value={toDateInputValue(rangeStart)}
          onChange={(e) => {
            if (!e.target.value) return
            setPreset('custom')
            setRangeStart(startOfDay(new Date(`${e.target.value}T00:00:00`)))
          }}
          className="min-h-touch rounded-md border border-outline bg-surface-container-lowest px-sm text-body-md text-on-surface"
        />
        <input
          type="date"
          aria-label="To date"
          value={toDateInputValue(rangeEnd)}
          onChange={(e) => {
            if (!e.target.value) return
            setPreset('custom')
            setRangeEnd(endOfDay(new Date(`${e.target.value}T00:00:00`)))
          }}
          className="min-h-touch rounded-md border border-outline bg-surface-container-lowest px-sm text-body-md text-on-surface"
        />
      </div>

      <div className="flex flex-col gap-md border-t border-surface-dim pt-sm">
        <FilterGroup label="Status">
          <FilterSelect
            ariaLabel="Kitchen status filter"
            options={KITCHEN_STATUS_FILTERS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </FilterGroup>
        <ChannelFulfillmentFilter
          channel={channelFilter}
          fulfillment={fulfillmentFilter}
          onChannelChange={setChannelFilter}
          onFulfillmentChange={setFulfillmentFilter}
        />
      </div>

      {settings && preparing.length > 0 && (
        <section className="flex flex-col gap-sm">
          <h2 className="text-label-bold uppercase tracking-wide text-on-surface-variant">
            🔥 Preparing Queue — drag to reorder ({preparing.length})
          </h2>
          <p className="text-label-sm text-on-surface-variant">
            Reordering here writes the same queue_priority /kitchen reads — a reorder shows up there too.
          </p>
          {walkIns.length > 0 && (
            <SortableList
              items={walkIns}
              getId={(b) => b.order.id}
              onReorder={handleReorderGroup(walkIns)}
              className="flex flex-col gap-sm"
              renderItem={(bundle, dragHandle) => (
                <KitchenOrderCard
                  order={bundle.order}
                  lines={bundle.lines}
                  modifiersByLineId={bundle.modifiersByLineId}
                  settings={settings}
                  now={now}
                  variant="preparing"
                  dragHandle={dragHandle}
                />
              )}
            />
          )}
          {others.length > 0 && (
            <SortableList
              items={others}
              getId={(b) => b.order.id}
              onReorder={handleReorderGroup(others)}
              className="flex flex-col gap-sm"
              renderItem={(bundle, dragHandle) => (
                <KitchenOrderCard
                  order={bundle.order}
                  lines={bundle.lines}
                  modifiersByLineId={bundle.modifiersByLineId}
                  settings={settings}
                  now={now}
                  variant="preparing"
                  dragHandle={dragHandle}
                />
              )}
            />
          )}
        </section>
      )}

      <section className="flex min-h-0 flex-1 flex-col gap-sm">
        <h2 className="text-label-bold uppercase tracking-wide text-on-surface-variant">All Orders ({filteredBundles.length})</h2>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-surface-dim bg-surface-container-lowest">
          {filteredBundles.length === 0 ? (
            <p className="p-md text-center text-body-md text-on-surface-variant">
              {bundleList.length === 0 ? 'No orders in this date range.' : 'No orders match your filters.'}
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-body-md">
              <thead className="sticky top-0 bg-surface-container text-label-bold text-on-surface-variant">
                <tr>
                  <th className="px-sm py-xs">Order #</th>
                  <th className="px-sm py-xs">Channel</th>
                  <th className="px-sm py-xs">Fulfillment</th>
                  <th className="px-sm py-xs">Status</th>
                  <th className="px-sm py-xs">Requested</th>
                  <th className="px-sm py-xs text-right">Total</th>
                  <th className="px-sm py-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBundles.map(({ order }) => (
                  <tr key={order.id} className="border-t border-surface-dim hover:bg-surface-container">
                    <td className="px-sm py-xs font-bold text-on-surface">#{order.order_number ?? '—'}</td>
                    <td className="px-sm py-xs text-on-surface-variant">{CHANNEL_LABEL[order.channel]}</td>
                    <td className="px-sm py-xs text-on-surface-variant">{FULFILLMENT_LABEL[getFulfillmentKind(order)]}</td>
                    <td className="px-sm py-xs">
                      <KitchenStatusBadge status={order.kitchen_status} />
                    </td>
                    <td className="px-sm py-xs text-on-surface-variant">
                      {order.requested_time ? new Date(order.requested_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-sm py-xs text-right font-bold text-on-surface">{formatCurrency(order.total)}</td>
                    <td className="px-sm py-xs">
                      <div className="flex flex-wrap gap-xs">
                        {isItemEditable(order) && (
                          <button
                            type="button"
                            onClick={() => setEditingItemsOrderId(order.id)}
                            className="text-label-sm font-bold text-primary underline"
                          >
                            Edit Items
                          </button>
                        )}
                        {order.fulfillment_type != null && order.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => setEditingTimeOrder(order)}
                            className="text-label-sm font-bold text-primary underline"
                          >
                            Edit Time
                          </button>
                        )}
                        {order.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => setCancellingOrder(order)}
                            className="text-label-sm font-bold text-error underline"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {addingManualOrder && settings && (
        <AddManualOrderFlow
          settings={settings}
          categories={categories}
          products={products}
          userId={user?.id ?? null}
          onClose={() => setAddingManualOrder(false)}
          onCreated={() => setAddingManualOrder(false)}
        />
      )}

      {editingTimeOrder && settings && (
        <EditRequestedTimeModal
          order={editingTimeOrder}
          settings={settings}
          onClose={() => setEditingTimeOrder(null)}
          onSaved={(requestedTimeIso) => patchOrder(editingTimeOrder.id, { requested_time: requestedTimeIso })}
        />
      )}

      {cancellingOrder && (
        <CancelOrderModal
          order={cancellingOrder}
          userId={user?.id ?? null}
          onClose={() => setCancellingOrder(null)}
          onCancelled={() => patchOrder(cancellingOrder.id, { status: 'voided', kitchen_status: 'cancelled' })}
        />
      )}

      {editingItemsOrderId &&
        (() => {
          const bundle = bundles.get(editingItemsOrderId)
          if (!bundle) return null
          return (
            <EditOrderItemsFlow
              order={bundle.order}
              lines={bundle.lines}
              modifiersByLineId={bundle.modifiersByLineId}
              categories={categories}
              products={products}
              modifierOptions={modifierOptions}
              userId={user?.id ?? null}
              onClose={() => setEditingItemsOrderId(null)}
              onSaved={() => setEditingItemsOrderId(null)}
            />
          )
        })()}
    </div>
  )
}
