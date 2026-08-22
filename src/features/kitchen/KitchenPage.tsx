import { useEffect, useMemo, useState } from 'react'
import { SortableList } from '../../components/ui'
import type { BusinessSettings } from '../../db'
import { fetchBusinessSettings, subscribeBusinessSettings } from '../../lib/businessSettingsRemote'
import { computeSortEpoch, getFulfillmentKind } from '../../lib/orderWorkflow'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { KitchenOrderCard } from './KitchenOrderCard'
import {
  confirmAndSendToKitchen,
  markReady,
  setPrepTimeOverride,
  setQueuePriority,
  useKitchenQueue,
  type KitchenOrderBundle,
} from './kitchenSupabaseData'
import { useKitchenAudioAlert } from './useKitchenAudioAlert'

function useClock(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function KitchenHeader({ connectionStatus }: { connectionStatus: 'connecting' | 'live' | 'reconnecting' }) {
  const now = useClock(1000)
  const label = connectionStatus === 'live' ? 'Live' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
  return (
    <header className="flex min-h-touch items-center justify-between border-b border-surface-dim bg-surface-container-lowest px-md py-sm">
      <span className="text-headline-md text-on-surface">🍳 Kitchen</span>
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

/** Computes a new manual queue_priority for the one card that moved, as the midpoint
 *  between its new neighbors' effective sort keys — touching only that card, so
 *  "Manually prioritized" never cascades to siblings. */
function computeDroppedPriority(
  group: KitchenOrderBundle[],
  orderedIds: string[],
  activeId: string,
  settings: BusinessSettings,
): number {
  const byId = new Map(group.map((b) => [b.order.id, b.order]))
  const newIndex = orderedIds.indexOf(activeId)
  const beforeOrder = newIndex > 0 ? byId.get(orderedIds[newIndex - 1]) : undefined
  const afterOrder = newIndex < orderedIds.length - 1 ? byId.get(orderedIds[newIndex + 1]) : undefined
  const beforeKey = beforeOrder ? computeSortEpoch(beforeOrder, settings) : null
  const afterKey = afterOrder ? computeSortEpoch(afterOrder, settings) : null

  if (beforeKey != null && afterKey != null) return (beforeKey + afterKey) / 2
  if (beforeKey != null) return beforeKey + 60_000
  if (afterKey != null) return afterKey - 60_000
  return Date.now()
}

/**
 * Real-time kitchen order queue — see docs/plans (Prompt 12). Top-level, unauthenticated,
 * direct-Supabase route (no Manager PIN gating: shared kitchen station device), modeled
 * on /order's architecture. See src/lib/orderWorkflow.ts for the shared status/urgency/
 * sort logic and src/db/schema.ts's KitchenStatus for the full lifecycle this implements.
 */
export function KitchenPage() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const now = useClock(30_000)
  const audio = useKitchenAudioAlert()
  const { bundles, connectionStatus, patchQueuePriority } = useKitchenQueue((order) => {
    // Only chime for an order that's actually workable right now — a pending-
    // confirmation order already chimed when it first arrived; this only fires again
    // if it somehow re-enters the active set as a distinct arrival (it doesn't in
    // normal use, since confirming it is an in-place UPDATE the hook treats as "already
    // known" — see kitchenSupabaseData.ts's ingestOrder).
    void order
    audio.playChime()
  })

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    async function load() {
      try {
        const initial = await fetchBusinessSettings()
        if (cancelled) return
        setSettings(initial)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load business settings.')
      }
    }
    void load()
    const unsubscribe = subscribeBusinessSettings(setSettings)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const bundleList = useMemo(() => Array.from(bundles.values()), [bundles])
  const pending = useMemo(
    () =>
      bundleList
        .filter((b) => b.order.kitchen_status === 'pending_confirmation')
        .sort((a, b) => new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime()),
    [bundleList],
  )
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

  async function runAction(action: () => Promise<void>) {
    try {
      await action()
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  function handleReorderGroup(group: KitchenOrderBundle[]) {
    return (orderedIds: string[], activeId: string) => {
      if (!settings) return
      const priority = computeDroppedPriority(group, orderedIds, activeId, settings)
      patchQueuePriority(activeId, priority) // optimistic — avoids a visible snap-back while the write is in flight
      void runAction(() => setQueuePriority(activeId, priority))
    }
  }

  function renderCard(bundle: KitchenOrderBundle, variant: 'preparing' | 'pending-confirmation', dragHandle?: Parameters<typeof KitchenOrderCard>[0]['dragHandle']) {
    if (!settings) return null
    return (
      <KitchenOrderCard
        order={bundle.order}
        lines={bundle.lines}
        modifiersByLineId={bundle.modifiersByLineId}
        settings={settings}
        now={now}
        variant={variant}
        dragHandle={dragHandle}
        onMarkReady={variant === 'preparing' ? () => void runAction(() => markReady(bundle.order.id)) : undefined}
        onConfirm={variant === 'pending-confirmation' ? () => void runAction(() => confirmAndSendToKitchen(bundle.order.id)) : undefined}
        onPrepTimeChange={(minutes) => void runAction(() => setPrepTimeOverride(bundle.order.id, minutes))}
      />
    )
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-md">
        <p className="text-body-lg text-on-surface-variant">Kitchen View is temporarily unavailable.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col gap-md bg-surface pb-xl" onPointerDown={audio.requestUnlock}>
      <KitchenHeader connectionStatus={connectionStatus} />

      <div className="flex flex-col gap-md px-md">
        {actionError && (
          <div className="rounded-md bg-error-container px-md py-sm text-body-md text-on-error-container">{actionError}</div>
        )}

        {loadError && <p className="text-body-md text-error">{loadError}</p>}

        {!settings ? (
          <p className="text-body-md text-on-surface-variant">Loading…</p>
        ) : (
          <>
            <section className="flex flex-col gap-sm">
              <h2 className="text-label-bold uppercase tracking-wide text-on-surface-variant">
                ⏳ Pending Confirmation ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">None right now.</p>
              ) : (
                <div className="flex flex-col gap-sm">
                  {pending.map((bundle) => (
                    <div key={bundle.order.id}>{renderCard(bundle, 'pending-confirmation')}</div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-sm">
              <h2 className="text-label-bold uppercase tracking-wide text-on-surface-variant">
                🔥 Preparing ({preparing.length})
              </h2>
              <p className="text-label-sm text-on-surface-variant">
                Sorted by start-by time — walk-ins always come first, since that customer is already at the counter.
              </p>

              {preparing.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">Nothing preparing right now.</p>
              ) : (
                <>
                  {walkIns.length > 0 && (
                    <SortableList
                      items={walkIns}
                      getId={(b) => b.order.id}
                      onReorder={handleReorderGroup(walkIns)}
                      className="flex flex-col gap-sm"
                      renderItem={(bundle, dragHandle) => renderCard(bundle, 'preparing', dragHandle)}
                    />
                  )}
                  {others.length > 0 && (
                    <SortableList
                      items={others}
                      getId={(b) => b.order.id}
                      onReorder={handleReorderGroup(others)}
                      className="flex flex-col gap-sm"
                      renderItem={(bundle, dragHandle) => renderCard(bundle, 'preparing', dragHandle)}
                    />
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* Fixed overlay, not in-flow: an in-flow banner that vanishes the instant the
          first tap unlocks audio would reflow every card below it mid-click — including
          whatever button that very tap landed on — and could make the tap miss its
          target. Fixed position means removing it never shifts anything else. */}
      {!audio.unlocked && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-warning-container px-md py-sm text-center text-body-md text-on-warning-container">
          Tap anywhere to enable order alert sounds.
        </div>
      )}
    </div>
  )
}
