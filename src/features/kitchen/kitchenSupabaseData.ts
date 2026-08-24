import { useEffect, useRef, useState } from 'react'
import type { KitchenStatus, Order, OrderLine, OrderLineModifier } from '../../db'
import { nowIso } from '../../db'
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
 *
 * Exported so orderManagementSupabaseData.ts's queue can call this too — a manager may
 * well look at Order Management before any kitchen station has ever loaded a given
 * order, and that screen needs real numbers just as much as /kitchen does. Also called
 * directly from orderSupabaseData.ts's submitOnlineOrder, as its very last step, so the
 * customer's confirmation screen can show the same real number staff will see, instead
 * of waiting for /kitchen to assign one on first load.
 */
export async function assignOrderNumberIfMissing(order: Order): Promise<Order> {
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
 *
 * `onOrderEdited` fires when an already-visible order's `items_edited_at` changes to a
 * non-null value distinct from what this hook last saw — i.e. Order Management's "Edit
 * Items" action touched it (see EditOrderItemsFlow.tsx/applyOrderItemEdit) — but not on
 * the clear-at-Ready transition (items_edited_at going back to null carries nothing new
 * to alert on). Lines/modifiers are otherwise treated as immutable post-creation
 * (fetched once); this is the one case where that assumption doesn't hold, so it's the
 * one case that triggers a refetch of them.
 */
export function useKitchenQueue(onNewOrder?: (order: Order) => void, onOrderEdited?: (order: Order) => void) {
  const [bundles, setBundles] = useState<Map<string, KitchenOrderBundle>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<KitchenConnectionStatus>('connecting')
  const onNewOrderRef = useRef(onNewOrder)
  onNewOrderRef.current = onNewOrder
  const onOrderEditedRef = useRef(onOrderEdited)
  onOrderEditedRef.current = onOrderEdited

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false
    // Ids currently believed to hold a full bundle (order + lines/modifiers) in state —
    // doubles as "have we already alerted for this id" and "do we still need to fetch
    // its lines" (lines are otherwise immutable post-creation, so normally fetched at
    // most once — see editedAtByOrderId below for the one exception).
    const knownActiveIds = new Set<string>()
    // Last-seen items_edited_at per known order, tracked outside React state so
    // ingestOrder can decide *before* calling setState whether this update actually
    // changed the items (and needs a lines refetch + onOrderEdited alert) or is just an
    // unrelated field patch (queue_priority drag, prep_time_override, ...).
    const editedAtByOrderId = new Map<string, string | null>()
    let firstLoadDone = false

    async function ingestOrder(rawOrder: Order) {
      if (cancelled) return

      if (!isActive(rawOrder.kitchen_status)) {
        editedAtByOrderId.delete(rawOrder.id)
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
        const previousEditedAt = editedAtByOrderId.get(order.id) ?? null
        const itemsChanged = order.items_edited_at !== previousEditedAt
        editedAtByOrderId.set(order.id, order.items_edited_at)

        if (itemsChanged) {
          const { lines, modifiersByLineId } = await fetchLinesForOrder(order.id)
          if (cancelled) return
          setBundles((prev) => {
            const existing = prev.get(order.id)
            if (!existing) return prev
            const next = new Map(prev)
            next.set(order.id, { order, lines, modifiersByLineId })
            return next
          })
          // Only alert for a genuine edit landing, not the clear-at-Ready transition
          // (items_edited_at going back to null on markReady).
          if (order.items_edited_at != null) onOrderEditedRef.current?.(order)
          return
        }

        // Nothing about the items changed — just patch the order fields.
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
      editedAtByOrderId.set(order.id, order.items_edited_at)
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

// Every mutation below sets updated_at explicitly: the `orders` table has no
// updated_at-on-UPDATE trigger, and these are raw Supabase REST writes (not the local
// Dexie touch()/touchPatch() path, which bumps it automatically) — periodic sync's
// incremental pull (src/sync/pull.ts, `gt('updated_at', sinceIso)`) would otherwise
// never notice a kitchen_status/queue_priority-only change on any other device, and it
// would sit invisible until that device's next full page-reload pull. See
// src/features/fulfillment/fulfillmentSupabaseData.ts's matching mutations for the
// same reasoning (root-caused together, 2026-08-22).

export async function markReady(orderId: string): Promise<void> {
  // Clears items_edited_at/items_edit_note along with the status transition — Ready is
  // the point past which Order Management's "Edit Items" no longer applies, so any
  // "this order changed" flag has served its purpose (see EditOrderItemsFlow.tsx).
  const { error } = await supabase
    .from('orders')
    .update({ kitchen_status: 'ready', items_edited_at: null, items_edit_note: null, updated_at: nowIso() })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to mark order ready: ${error.message}`)
}

export async function confirmAndSendToKitchen(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ kitchen_status: 'preparing', updated_at: nowIso() })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to send order to the kitchen: ${error.message}`)
}

export async function setQueuePriority(orderId: string, priority: number): Promise<void> {
  const { error } = await supabase.from('orders').update({ queue_priority: priority, updated_at: nowIso() }).eq('id', orderId)
  if (error) throw new Error(`Failed to reorder: ${error.message}`)
}

export async function setPrepTimeOverride(orderId: string, minutes: number | null): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ prep_time_override_minutes: minutes, updated_at: nowIso() })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to update prep time: ${error.message}`)
}
