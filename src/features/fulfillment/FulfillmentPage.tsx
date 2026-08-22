import { useEffect, useMemo, useState } from 'react'
import { getFulfillmentKind } from '../../lib/orderWorkflow'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { FulfillmentOrderCard } from './FulfillmentOrderCard'
import {
  markDelivered,
  markOutForDelivery,
  markPickedUp,
  markServed,
  useFulfillmentQueue,
  type FulfillmentOrderBundle,
} from './fulfillmentSupabaseData'

function useClock(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function FulfillmentHeader({ connectionStatus }: { connectionStatus: 'connecting' | 'live' | 'reconnecting' }) {
  const now = useClock(1000)
  const label = connectionStatus === 'live' ? 'Live' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
  return (
    <header className="flex min-h-touch items-center justify-between border-b border-surface-dim bg-surface-container-lowest px-md py-sm">
      <span className="text-headline-md text-on-surface">🚚 Fulfillment</span>
      <div className="flex items-center gap-md">
        <span
          className={[
            'flex items-center gap-xs text-label-bold',
            connectionStatus === 'live' ? 'text-success' : 'text-warning',
          ].join(' ')}
        >
          <span className={connectionStatus === 'live' ? 'text-success' : 'text-warning'}>●</span>
          {label}
        </span>
        <span className="text-body-md tabular-nums text-on-surface">
          {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </header>
  )
}

/** Oldest-first within each column/sub-section. Not computeSortEpoch — that's about
 *  pre-ready urgency/start-by math, which has no meaning once an order is already
 *  'ready'. Walk-ins have no requested_time, so they fall back to created_at. */
function byRequestedOrCreatedAsc(a: FulfillmentOrderBundle, b: FulfillmentOrderBundle): number {
  const aTime = new Date(a.order.requested_time ?? a.order.created_at).getTime()
  const bTime = new Date(b.order.requested_time ?? b.order.created_at).getTime()
  return aTime - bTime
}

/** Deliberately bold/saturated, off the app's usual Material-token palette — these are
 *  glanceable category colors for a shared, walk-up-and-use station screen, not brand
 *  chrome, so consistency with the rest of the app matters less than being instantly
 *  readable at a distance across the three columns. */
const COLUMN_THEME = {
  'walk-in': { bg: 'bg-blue-600', text: 'text-white' },
  pickup: { bg: 'bg-violet-600', text: 'text-white' },
  delivery: { bg: 'bg-emerald-700', text: 'text-white' },
} as const

function ColumnHeader({ kind, title }: { kind: keyof typeof COLUMN_THEME; title: string }) {
  const theme = COLUMN_THEME[kind]
  return (
    <h1 className={`rounded-lg px-md py-sm text-headline-md font-bold ${theme.bg} ${theme.text}`}>{title}</h1>
  )
}

interface ColumnSectionProps {
  label: string
  bundles: FulfillmentOrderBundle[]
  variant: 'walk-in' | 'pickup' | 'ready-to-dispatch' | 'delivery-queue'
  actionLabel: string
  actionColor: 'green' | 'orange'
  onAction: (orderId: string) => void
}

function ColumnSection({ label, bundles, variant, actionLabel, actionColor, onAction }: ColumnSectionProps) {
  return (
    <div className="flex flex-col gap-sm">
      <h2 className="text-label-bold uppercase tracking-wide text-on-surface-variant">
        {label} ({bundles.length})
      </h2>
      {bundles.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">None right now.</p>
      ) : (
        bundles.map((bundle) => (
          <FulfillmentOrderCard
            key={bundle.order.id}
            order={bundle.order}
            lines={bundle.lines}
            modifiersByLineId={bundle.modifiersByLineId}
            variant={variant}
            actionLabel={actionLabel}
            actionColor={actionColor}
            onAction={() => onAction(bundle.order.id)}
          />
        ))
      )}
    </div>
  )
}

/**
 * Real-time fulfillment hand-off queue — the second half of the kitchen-status
 * lifecycle after /kitchen marks an order 'ready'. Top-level, unauthenticated,
 * direct-Supabase route (no Manager PIN gating: shared front-counter/dispatch station
 * device), modeled on /kitchen's architecture. See src/lib/orderWorkflow.ts for the
 * shared getFulfillmentKind/formatDeliveryAddress logic and src/db/schema.ts's
 * KitchenStatus for the full lifecycle.
 */
export function FulfillmentPage() {
  const [actionError, setActionError] = useState<string | null>(null)
  const { bundles, connectionStatus } = useFulfillmentQueue()

  const bundleList = useMemo(() => Array.from(bundles.values()), [bundles])

  const walkIns = useMemo(
    () =>
      bundleList
        .filter((b) => getFulfillmentKind(b.order) === 'walk-in' && b.order.kitchen_status === 'ready')
        .sort(byRequestedOrCreatedAsc),
    [bundleList],
  )
  const pickups = useMemo(
    () =>
      bundleList
        .filter((b) => getFulfillmentKind(b.order) === 'pickup' && b.order.kitchen_status === 'ready')
        .sort(byRequestedOrCreatedAsc),
    [bundleList],
  )
  const readyToDispatch = useMemo(
    () =>
      bundleList
        .filter((b) => getFulfillmentKind(b.order) === 'delivery' && b.order.kitchen_status === 'ready')
        .sort(byRequestedOrCreatedAsc),
    [bundleList],
  )
  const deliveryQueue = useMemo(
    () =>
      bundleList
        .filter((b) => getFulfillmentKind(b.order) === 'delivery' && b.order.kitchen_status === 'out_for_delivery')
        .sort(byRequestedOrCreatedAsc),
    [bundleList],
  )

  async function runAction(action: () => Promise<void>) {
    try {
      await action()
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-md">
        <p className="text-body-lg text-on-surface-variant">Fulfillment View is temporarily unavailable.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col gap-md bg-surface pb-xl">
      <FulfillmentHeader connectionStatus={connectionStatus} />

      <div className="flex flex-col gap-md px-md">
        {actionError && (
          <div className="rounded-md bg-error-container px-md py-sm text-body-md text-on-error-container">{actionError}</div>
        )}

        <div className="grid grid-cols-1 gap-md md:grid-cols-3">
          <section className="flex flex-col gap-md">
            <ColumnHeader kind="walk-in" title="Walk-in" />
            <ColumnSection
              label="Ready"
              bundles={walkIns}
              variant="walk-in"
              actionLabel="Served"
              actionColor="green"
              onAction={(id) => void runAction(() => markServed(id))}
            />
          </section>

          <section className="flex flex-col gap-md">
            <ColumnHeader kind="pickup" title="Pickup" />
            <ColumnSection
              label="Waiting for Pickup"
              bundles={pickups}
              variant="pickup"
              actionLabel="Picked Up"
              actionColor="green"
              onAction={(id) => void runAction(() => markPickedUp(id))}
            />
          </section>

          <section className="flex flex-col gap-md">
            <ColumnHeader kind="delivery" title="Delivery" />
            <ColumnSection
              label="Ready to Dispatch"
              bundles={readyToDispatch}
              variant="ready-to-dispatch"
              actionLabel="Out for Delivery"
              actionColor="orange"
              onAction={(id) => void runAction(() => markOutForDelivery(id))}
            />
            <ColumnSection
              label="Delivery Queue"
              bundles={deliveryQueue}
              variant="delivery-queue"
              actionLabel="Delivered"
              actionColor="green"
              onAction={(id) => void runAction(() => markDelivered(id))}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
