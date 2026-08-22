import { useEffect, useState } from 'react'
import type { KitchenStatus, Order, OrderLine, OrderLineModifier } from '../../db'
import { nowIso } from '../../db'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

/**
 * Direct-Supabase data/realtime/mutation layer for /fulfillment — mirrors
 * src/features/kitchen/kitchenSupabaseData.ts's style exactly. /fulfillment never
 * touches Dexie (see main.tsx's boot guard): it needs a live, unified view of every
 * order sitting at 'ready' or 'out_for_delivery', regardless of which device (Register
 * or an online customer) originated it — same reasoning as /kitchen.
 *
 * No queue_priority/drag-reorder here — orders move by staff action, not manual
 * reordering. Unlike /kitchen, no assignOrderNumberIfMissing either (by the time an
 * order reaches 'ready' it was already numbered on /kitchen).
 */

const FULFILLMENT_STATUSES: KitchenStatus[] = ['ready', 'out_for_delivery']

function isInScope(status: KitchenStatus): boolean {
  return FULFILLMENT_STATUSES.includes(status)
}

export interface FulfillmentOrderBundle {
  order: Order
  lines: OrderLine[]
  modifiersByLineId: Map<string, OrderLineModifier[]>
}

export type FulfillmentConnectionStatus = 'connecting' | 'live' | 'reconnecting'

/** Copied from kitchenSupabaseData.ts's fetchLinesForOrder — not exported there (each
 *  feature folder's data layer is a self-contained chunk, see that file's own header
 *  comment), so this is a deliberate duplicate, not drift. */
async function fetchLinesForOrder(
  orderId: string,
): Promise<{ lines: OrderLine[]; modifiersByLineId: Map<string, OrderLineModifier[]> }> {
  const { data: lineRows, error: linesError } = await supabase
    .from('order_lines')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (linesError) throw new Error(`Failed to load order items: ${linesError.message}`)

  const lines = (lineRows ?? []) as OrderLine[]
  const modifiersByLineId = new Map<string, OrderLineModifier[]>()
  const lineIds = lines.map((l) => l.id)
  if (lineIds.length > 0) {
    const { data: modRows, error: modsError } = await supabase
      .from('order_line_modifiers')
      .select('*')
      .in('order_line_id', lineIds)
    if (modsError) throw new Error(`Failed to load item options: ${modsError.message}`)
    for (const mod of (modRows ?? []) as OrderLineModifier[]) {
      const list = modifiersByLineId.get(mod.order_line_id) ?? []
      list.push(mod)
      modifiersByLineId.set(mod.order_line_id, list)
    }
  }
  return { lines, modifiersByLineId }
}

/**
 * The live queue: initial fetch + an unfiltered postgres_changes subscription on
 * `orders`. Deliberately unfiltered, same reasoning as /kitchen's useKitchenQueue: a
 * server-side filter is evaluated against each event's *new* row, so an UPDATE moving
 * an order OUT of scope (ready -> served/picked_up, out_for_delivery -> delivered)
 * wouldn't match and the card would never be told to disappear — all in/out-of-scope
 * decisions happen client-side here instead.
 */
export function useFulfillmentQueue(): {
  bundles: Map<string, FulfillmentOrderBundle>
  connectionStatus: FulfillmentConnectionStatus
} {
  const [bundles, setBundles] = useState<Map<string, FulfillmentOrderBundle>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<FulfillmentConnectionStatus>('connecting')

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false
    // Doubles as "do we already have a bundle for this id" and "do we still need to
    // fetch its lines" — lines never change post-creation, so fetched at most once.
    const knownIds = new Set<string>()

    async function ingestOrder(order: Order) {
      if (cancelled) return

      if (!isInScope(order.kitchen_status)) {
        if (knownIds.delete(order.id)) {
          setBundles((prev) => {
            if (!prev.has(order.id)) return prev
            const next = new Map(prev)
            next.delete(order.id)
            return next
          })
        }
        return
      }

      if (knownIds.has(order.id)) {
        // Item/modifier lists are immutable post-creation — just patch the order fields.
        setBundles((prev) => {
          const existing = prev.get(order.id)
          if (!existing) return prev
          const next = new Map(prev)
          next.set(order.id, { ...existing, order })
          return next
        })
        return
      }

      const { lines, modifiersByLineId } = await fetchLinesForOrder(order.id)
      if (cancelled) return
      knownIds.add(order.id)
      setBundles((prev) => {
        const next = new Map(prev)
        next.set(order.id, { order, lines, modifiersByLineId })
        return next
      })
    }

    async function refetch() {
      const { data, error } = await supabase.from('orders').select('*').in('kitchen_status', FULFILLMENT_STATUSES)
      if (cancelled) return
      if (error) {
        console.error('Fulfillment queue refetch failed', error)
        return
      }
      await Promise.all(((data ?? []) as Order[]).map(ingestOrder))
    }

    const channel = supabase
      .channel('fulfillment:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'DELETE') return // orders are never hard-deleted; ignore defensively
        void ingestOrder(payload.new as Order)
      })
      .subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('live')
          void refetch() // first connect AND every reconnect — catches anything missed during a dropout
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('reconnecting')
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [])

  return { bundles, connectionStatus }
}

// Every mutation below sets updated_at explicitly: the `orders` table has no
// updated_at-on-UPDATE trigger, and these are raw Supabase REST writes (not the local
// Dexie touch()/touchPatch() path, which bumps it automatically) — periodic sync's
// incremental pull (src/sync/pull.ts, `gt('updated_at', sinceIso)`) would otherwise
// never notice a kitchen_status-only change on any other device (Order History,
// Analytics, Register), and it would sit invisible there until that device's next full
// page-reload pull. This was the root cause behind orders not appearing in Order
// History/Analytics after being actioned here — found and fixed 2026-08-22, alongside
// src/features/kitchen/kitchenSupabaseData.ts's identical mutations.
//
// markPickedUp/markDelivered also set status: 'completed' + completed_at: online orders
// have no other "payment/sale complete" event the way a dine-in Register checkout does
// (src/features/register/checkoutData.ts sets both at payment time) — picked-up/
// delivered *is* that moment for them, so it's the first and only place completed_at
// gets written. markServed (walk-in) deliberately leaves status/completed_at alone:
// dine-in orders are already status: 'completed' from checkout, before kitchen prep
// even starts, and completed_at is set-once (see schema.ts's Order.completed_at
// comment) — overwriting it here would shift a sale's recorded time later than when it
// actually happened.

export async function markServed(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ kitchen_status: 'served', updated_at: nowIso() })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to mark order served: ${error.message}`)
}

export async function markPickedUp(orderId: string): Promise<void> {
  const now = nowIso()
  const { error } = await supabase
    .from('orders')
    .update({ kitchen_status: 'picked_up', status: 'completed', completed_at: now, updated_at: now })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to mark order picked up: ${error.message}`)
}

export async function markOutForDelivery(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ kitchen_status: 'out_for_delivery', updated_at: nowIso() })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to mark order out for delivery: ${error.message}`)
}

export async function markDelivered(orderId: string): Promise<void> {
  const now = nowIso()
  const { error } = await supabase
    .from('orders')
    .update({ kitchen_status: 'delivered', status: 'completed', completed_at: now, updated_at: now })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to mark order delivered: ${error.message}`)
}
