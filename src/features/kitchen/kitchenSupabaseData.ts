import { useEffect, useRef, useState } from 'react'
import type { KitchenStatus, Order, OrderLine, OrderLineModifier } from '../../db'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

/**
 * Direct-Supabase data/realtime/mutation layer for /kitchen — mirrors
 * src/features/order/orderSupabaseData.ts's plain-sequential-REST style. /kitchen never
 * touches Dexie (see main.tsx's boot guard): it must unify Register-originated orders
 * (created locally, synced up) and customer-originated online orders (created directly
 * in Supabase) in one live view, which only a direct-Supabase read/subscribe can do.
 */

const ACTIVE_KITCHEN_STATUSES: KitchenStatus[] = ['pending_confirmation', 'preparing']

function isActive(status: KitchenStatus): boolean {
  return ACTIVE_KITCHEN_STATUSES.includes(status)
}

export interface KitchenOrderBundle {
  order: Order
  lines: OrderLine[]
  modifiersByLineId: Map<string, OrderLineModifier[]>
}

export type KitchenConnectionStatus = 'connecting' | 'live' | 'reconnecting'

/**
 * Online orders are inserted with order_number: null and stay that way until something
 * assigns one lazily (see 20260821010000_add_online_order_fields.sql's comment: "a
 * future staff-side view assigns the real number when someone first acts on the
 * order") — this is that view. Every kitchen card needs a number, including in Pending
 * Confirmation before any staff action, so this runs the moment an order first becomes
 * visible here, not deferred to a button press.
 *
 * Computed against Supabase's live max (the single shared source of truth), not a
 * per-device Dexie replica — safer than Register's own "local max+1"
 * (src/features/register/registerData.ts's getNextOrderNumber), which exists
 * specifically because Dexie *can* diverge across devices. The `.is('order_number',
 * null)` guard makes the update a no-op if another concurrent assignment already won;
 * the existing unique index (orders_order_number_unique_idx, NULLs distinct) is the
 * final backstop, same accepted-risk shape as Register's today.
 */
async function assignOrderNumberIfMissing(order: Order): Promise<Order> {
  if (order.order_number != null) return order

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: maxRow } = await supabase
      .from('orders')
      .select('order_number')
      .not('order_number', 'is', null)
      .order('order_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const next = (maxRow?.order_number ?? 0) + 1

    const { data, error } = await supabase
      .from('orders')
      .update({ order_number: next })
      .eq('id', order.id)
      .is('order_number', null)
      .select()
      .single()
    if (!error && data) return data as Order
    // Either a genuine conflict (another writer claimed `next` first) or another
    // writer already numbered this exact order (the .is() guard matched 0 rows) —
    // either way, retry with a fresh max.
  }

  // Gave up after 3 attempts — re-fetch and return whatever's there now (most likely
  // another concurrent assignment already succeeded) rather than leave the card unrenderable.
  const { data } = await supabase.from('orders').select('*').eq('id', order.id).single()
  return (data as Order | null) ?? order
}

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
 * `orders`, plus "brand-new order" detection that fires `onNewOrder` exactly once per
 * order that enters {pending_confirmation, preparing} — whether that's a fresh INSERT
 * (an online order) or an UPDATE (a dine-in order whose Dexie row already existed as
 * kitchen_status: 'new' before payment completed). The subscription is deliberately
 * unfiltered: a server-side filter (like subscribeBusinessSettings's id=eq.singleton) is
 * evaluated against each event's *new* row, so an UPDATE moving an order OUT of scope
 * (preparing -> ready) wouldn't match and the card would never be told to disappear —
 * all in/out-of-scope decisions happen client-side here instead.
 */
export function useKitchenQueue(onNewOrder?: (order: Order) => void) {
  const [bundles, setBundles] = useState<Map<string, KitchenOrderBundle>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<KitchenConnectionStatus>('connecting')
  const onNewOrderRef = useRef(onNewOrder)
  onNewOrderRef.current = onNewOrder

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false
    // Ids currently believed to hold a full bundle (order + lines/modifiers) in state —
    // doubles as "have we already alerted for this id" and "do we still need to fetch
    // its lines" (lines never change post-creation, so they're fetched at most once).
    const knownActiveIds = new Set<string>()
    let firstLoadDone = false

    async function ingestOrder(rawOrder: Order) {
      if (cancelled) return

      if (!isActive(rawOrder.kitchen_status)) {
        if (knownActiveIds.delete(rawOrder.id)) {
          setBundles((prev) => {
            if (!prev.has(rawOrder.id)) return prev
            const next = new Map(prev)
            next.delete(rawOrder.id)
            return next
          })
        }
        return
      }

      const alreadyKnown = knownActiveIds.has(rawOrder.id)
      const order = await assignOrderNumberIfMissing(rawOrder)
      if (cancelled) return

      if (alreadyKnown) {
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
      knownActiveIds.add(order.id)
      setBundles((prev) => {
        const next = new Map(prev)
        next.set(order.id, { order, lines, modifiersByLineId })
        return next
      })
      // Never alert for the pre-existing backlog seen during the very first load —
      // only for genuine arrivals after that (live INSERT/UPDATE, or a reconnect
      // catch-up refetch picking up something missed during a dropout).
      if (firstLoadDone) onNewOrderRef.current?.(order)
    }

    async function refetch() {
      const { data, error } = await supabase.from('orders').select('*').in('kitchen_status', ACTIVE_KITCHEN_STATUSES)
      if (cancelled) return
      if (error) {
        console.error('Kitchen queue refetch failed', error)
        return
      }
      await Promise.all(((data ?? []) as Order[]).map(ingestOrder))
      if (!cancelled) firstLoadDone = true
    }

    const channel = supabase
      .channel('kitchen:orders')
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

  /**
   * Optimistic local patch, applied synchronously right before the fire-and-forget
   * setQueuePriority() write below — otherwise the list would visibly snap back to the
   * old order for the round-trip's duration, then jump again once the realtime echo
   * arrives (which becomes a harmless no-op reconciliation once this has already applied).
   */
  function patchQueuePriority(orderId: string, priority: number) {
    setBundles((prev) => {
      const existing = prev.get(orderId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(orderId, { ...existing, order: { ...existing.order, queue_priority: priority } })
      return next
    })
  }

  return { bundles, connectionStatus, patchQueuePriority }
}

export async function markReady(orderId: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ kitchen_status: 'ready' }).eq('id', orderId)
  if (error) throw new Error(`Failed to mark order ready: ${error.message}`)
}

export async function confirmAndSendToKitchen(orderId: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ kitchen_status: 'preparing' }).eq('id', orderId)
  if (error) throw new Error(`Failed to send order to the kitchen: ${error.message}`)
}

export async function setQueuePriority(orderId: string, priority: number): Promise<void> {
  const { error } = await supabase.from('orders').update({ queue_priority: priority }).eq('id', orderId)
  if (error) throw new Error(`Failed to reorder: ${error.message}`)
}

export async function setPrepTimeOverride(orderId: string, minutes: number | null): Promise<void> {
  const { error } = await supabase.from('orders').update({ prep_time_override_minutes: minutes }).eq('id', orderId)
  if (error) throw new Error(`Failed to update prep time: ${error.message}`)
}
