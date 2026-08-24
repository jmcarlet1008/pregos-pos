import { useEffect, useRef, useState } from 'react'
import type { FulfillmentType, Order, OrderLine, OrderLineModifier, PaymentMethod, StockAdjustment } from '../../db'
import { nowIso } from '../../db'
import { getInitialKitchenStatus } from '../../lib/orderWorkflow'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { cartLineTotal, cartTotal, type CartLine } from '../order/cartTypes'
// Type-only cross-feature import — Fulfillment/PaymentInput are plain type shapes (no
// Dexie/runtime coupling), and Order Management's "Add Manual Order" flow reuses /order's
// FulfillmentStep/DeliveryZoneStep/PaymentStep/CustomerInfoStep components directly
// (see AddManualOrderFlow.tsx), which are already typed against these exact shapes.
import type { Fulfillment, PaymentInput } from '../order/orderSupabaseData'
import { assignOrderNumberIfMissing, setQueuePriority } from '../kitchen/kitchenSupabaseData'

/**
 * Direct-Supabase data/realtime/mutation layer for Order Management — mirrors
 * src/features/kitchen/kitchenSupabaseData.ts's plain-sequential-REST style (its own
 * fetchLinesForOrder duplicated below, same self-contained-per-feature convention).
 * Unlike /kitchen and /fulfillment, this screen is Manager-only and lives inside the
 * authenticated, Dexie-booted app shell (see routes.ts/App.tsx) — but its order data
 * still comes straight from Supabase, since only a direct read/subscribe unifies
 * Register-originated orders (Dexie, synced up on a delay) with online/phone-originated
 * orders (written straight to Supabase) in one live view, and because it must show
 * every order regardless of status, not just what's currently active in the kitchen.
 */

export { setQueuePriority }

export interface OrderManagementBundle {
  order: Order
  lines: OrderLine[]
  modifiersByLineId: Map<string, OrderLineModifier[]>
}

export type OrderManagementConnectionStatus = 'connecting' | 'live' | 'reconnecting'

function id() {
  return crypto.randomUUID()
}

/** Copied from kitchenSupabaseData.ts — deliberate duplicate, not drift (see that
 *  file's own header comment on why each direct-Supabase data layer is self-contained). */
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
 * The live order set: an initial fetch bounded by `range` (Order Management shows
 * every order, every channel, every status — unlike Kitchen/Fulfillment's small
 * kitchen_status subset — so the initial payload needs a bound of its own; this table
 * only grows) plus an unfiltered postgres_changes subscription on `orders`. The
 * subscription is deliberately unfiltered AND unscoped by `range`: a server-side filter
 * only evaluates an event's *new* row (so it can't tell client-side scope apart), and a
 * brand-new order must always appear immediately regardless of the currently-selected
 * date range — see kitchenSupabaseData.ts's useKitchenQueue for the same reasoning
 * applied to kitchen_status scope instead of a date range.
 */
export function useOrderManagementQueue(range: { from: Date; to: Date }): {
  bundles: Map<string, OrderManagementBundle>
  connectionStatus: OrderManagementConnectionStatus
  patchOrder: (orderId: string, patch: Partial<Order>) => void
} {
  const [bundles, setBundles] = useState<Map<string, OrderManagementBundle>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<OrderManagementConnectionStatus>('connecting')
  const rangeRef = useRef(range)
  rangeRef.current = range

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false
    const knownIds = new Set<string>()
    // Last-seen items_edited_at per known order — same purpose as
    // kitchenSupabaseData.ts's matching map: lets ingestOrder tell "items actually
    // changed" (Order Management's own "Edit Items" action, possibly from a different
    // manager's tab) apart from an unrelated field patch, before deciding to refetch.
    const editedAtByOrderId = new Map<string, string | null>()

    async function ingestOrder(rawOrder: Order) {
      if (cancelled) return

      if (knownIds.has(rawOrder.id)) {
        const previousEditedAt = editedAtByOrderId.get(rawOrder.id) ?? null
        const itemsChanged = rawOrder.items_edited_at !== previousEditedAt
        editedAtByOrderId.set(rawOrder.id, rawOrder.items_edited_at)

        if (itemsChanged) {
          const { lines, modifiersByLineId } = await fetchLinesForOrder(rawOrder.id)
          if (cancelled) return
          setBundles((prev) => {
            const existing = prev.get(rawOrder.id)
            if (!existing) return prev
            const next = new Map(prev)
            next.set(rawOrder.id, { order: rawOrder, lines, modifiersByLineId })
            return next
          })
          return
        }

        // Nothing about the items changed — just patch the order fields.
        setBundles((prev) => {
          const existing = prev.get(rawOrder.id)
          if (!existing) return prev
          const next = new Map(prev)
          next.set(rawOrder.id, { ...existing, order: rawOrder })
          return next
        })
        return
      }

      // Every kitchen card needs a number, and Order Management is often the *first*
      // screen to ever see a given order (a manager may check it before any kitchen
      // station has loaded that order) — so this can't be left to /kitchen alone.
      const order = await assignOrderNumberIfMissing(rawOrder)
      if (cancelled) return
      const { lines, modifiersByLineId } = await fetchLinesForOrder(order.id)
      if (cancelled) return
      knownIds.add(order.id)
      editedAtByOrderId.set(order.id, order.items_edited_at)
      setBundles((prev) => {
        const next = new Map(prev)
        next.set(order.id, { order, lines, modifiersByLineId })
        return next
      })
    }

    async function refetch() {
      const { from, to } = rangeRef.current
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
      if (cancelled) return
      if (error) {
        console.error('Order Management refetch failed', error)
        return
      }
      const rows = (data ?? []) as Order[]
      const entries = await Promise.all(
        rows.map(async (rawOrder) => {
          const order = await assignOrderNumberIfMissing(rawOrder)
          const { lines, modifiersByLineId } = await fetchLinesForOrder(order.id)
          return [order.id, { order, lines, modifiersByLineId }] as const
        }),
      )
      if (cancelled) return
      knownIds.clear()
      editedAtByOrderId.clear()
      for (const [orderId, bundle] of entries) {
        knownIds.add(orderId)
        editedAtByOrderId.set(orderId, bundle.order.items_edited_at)
      }
      setBundles(new Map(entries))
    }

    const channel = supabase
      .channel('order-management:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'DELETE') return // orders are never hard-deleted; ignore defensively
        void ingestOrder(payload.new as Order)
      })
      .subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('live')
          void refetch() // first connect, every reconnect, and every range change (see the effect's deps)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('reconnecting')
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
    // Re-subscribes (and re-bounds the initial fetch) whenever the selected date range
    // changes — infrequent (a manager picking a different filter), so re-establishing
    // the channel here is simpler than threading range changes into a stable subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime()])

  /** Optimistic local patch, applied synchronously before a fire-and-forget write —
   *  same rationale as kitchenSupabaseData.ts's patchQueuePriority. */
  function patchOrder(orderId: string, patch: Partial<Order>) {
    setBundles((prev) => {
      const existing = prev.get(orderId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(orderId, { ...existing, order: { ...existing.order, ...patch } })
      return next
    })
  }

  return { bundles, connectionStatus, patchOrder }
}

// Every mutation below sets updated_at explicitly — see kitchenSupabaseData.ts's shared
// header comment on why: the `orders` table has no updated_at-on-UPDATE trigger, and
// these are raw Supabase REST writes (not the local Dexie touch()/touchPatch() path,
// which bumps it automatically) — periodic sync's incremental pull would otherwise
// never notice the change on any other device. INSERTs don't need it set explicitly —
// created_at/updated_at both default to now() server-side (see 20260722000000_init_schema.sql).

export async function updateRequestedTime(orderId: string, requestedTimeIso: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ requested_time: requestedTimeIso, updated_at: nowIso() })
    .eq('id', orderId)
  if (error) throw new Error(`Failed to update the requested time: ${error.message}`)
}

/**
 * Reads current stock_on_hand and writes it back guarded by an equality check
 * (`.eq('stock_on_hand', current)`), retrying up to 3 times on a lost race — the same
 * compare-and-swap-with-retry shape kitchenSupabaseData.ts's assignOrderNumberIfMissing
 * already uses for order_number. This codebase has no Postgres RPC/function precedent
 * anywhere (every direct-Supabase write path is plain sequential REST, and
 * submitOnlineOrder's own doc comment already accepts non-atomicity for its own
 * sequential inserts) — this is "atomic enough" for a single-row counter update without
 * introducing a new architectural pattern. Gives up silently (logs) after 3 attempts
 * rather than fail the whole calling operation over a stock-count race.
 */
async function adjustProductStock(productId: string, delta: number): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: productRow, error: readError } = await supabase
      .from('products')
      .select('stock_on_hand')
      .eq('id', productId)
      .maybeSingle()
    if (readError || !productRow) return // product may have been removed since; nothing to adjust

    const current = (productRow as { stock_on_hand: number }).stock_on_hand
    const { data, error } = await supabase
      .from('products')
      .update({ stock_on_hand: current + delta, updated_at: nowIso() })
      .eq('id', productId)
      .eq('stock_on_hand', current)
      .select('id')
      .maybeSingle()
    if (!error && data) return
    // Another writer changed stock_on_hand between our read and write — retry with a fresh read.
  }
  console.error(`Failed to adjust stock for product ${productId} after 3 attempts — a concurrent write kept winning.`)
}

/**
 * How much stock one CartLine's quantity+modifiers deducts, per product.track_inventory
 * and each selected modifier's deducts_stock/deduct_qty — 0 if the product doesn't
 * track inventory. Shared by createManualOrder (a fresh order's full deduction) and
 * applyOrderItemEdit (an edited order's before/after comparison), so the two stay in
 * lockstep rather than drifting apart as two separately-maintained copies of the same
 * formula.
 */
function stockDeductionQty(line: CartLine): number {
  if (!line.product.track_inventory) return 0
  const addonQty = line.selections.reduce((sum, o) => sum + (o.deducts_stock ? o.deduct_qty * line.quantity : 0), 0)
  return line.quantity + addonQty
}

export interface CreateManualOrderInput {
  lines: CartLine[]
  fulfillment: Fulfillment // never { type: 'pickup' } isn't walk-in — a phone order is always pickup or delivery
  requestedTimeIso: string
  payment: PaymentInput
  customerName: string
  customerContact: string
  userId: string | null // manager/cashier entering the order — for user_id and StockAdjustment.created_by
}

/**
 * Writes a manually-entered phone order straight to Supabase — same shape as
 * src/features/order/orderSupabaseData.ts's submitOnlineOrder (order, lines, modifiers,
 * a 'pending' Payment row: a phone order's payment isn't verified in-app either), tagged
 * channel: 'phone' and routed via the same getInitialKitchenStatus every order path
 * uses. Unlike online orders, a manual order DOES deduct stock (per user confirmation —
 * see the plan) — mirroring checkoutData.ts's completeOrder per-line delta (quantity +
 * modifier deducts_stock), but as its own loop run LAST, after the order/lines/
 * modifiers/payment all exist: a failure at any earlier step then leaves no stock
 * touched at all (nothing to reconcile), rather than risking an orphaned stock
 * decrement with no order behind it. Plain sequential REST, not one DB transaction —
 * same accepted-non-atomicity shape submitOnlineOrder's own doc comment already
 * establishes for this codebase (no FK constraints by design).
 */
export async function createManualOrder(input: CreateManualOrderInput): Promise<string> {
  const orderId = id()
  const total = cartTotal(input.lines)
  const fulfillmentType: FulfillmentType = input.fulfillment.type
  const paymentMethod: PaymentMethod = input.payment.method
  const kitchenStatus = getInitialKitchenStatus({
    channel: 'phone',
    fulfillmentType,
    zoneAutoRoute: input.fulfillment.type === 'delivery' ? input.fulfillment.zoneAutoRoute : null,
  })

  const { error: orderError } = await supabase.from('orders').insert({
    id: orderId,
    order_number: null,
    status: 'active',
    total,
    shift_id: null,
    user_id: input.userId,
    completed_at: null,
    prep_time_override_minutes: null,
    kitchen_status: kitchenStatus,
    queue_priority: null,
    channel: 'phone',
    fulfillment_type: fulfillmentType,
    delivery_zone: input.fulfillment.type === 'delivery' ? input.fulfillment.zoneName : null,
    delivery_address: input.fulfillment.type === 'delivery' ? input.fulfillment.address : null,
    delivery_lat: input.fulfillment.type === 'delivery' ? input.fulfillment.lat : null,
    delivery_lng: input.fulfillment.type === 'delivery' ? input.fulfillment.lng : null,
    requested_time: input.requestedTimeIso,
    payment_method: paymentMethod,
    cash_tendered_amount: input.payment.method === 'cash' ? input.payment.tendered : null,
    gcash_customer_confirmed: input.payment.method === 'gcash' ? true : null,
    customer_name: input.customerName.trim(),
    customer_contact: input.customerContact.trim(),
    cancellation_reason: null,
    items_edited_at: null,
    items_edit_note: null,
  })
  if (orderError) throw new Error(`Failed to create the order: ${orderError.message}`)

  const lineIds = input.lines.map(() => id())

  const { error: linesError } = await supabase.from('order_lines').insert(
    input.lines.map((line, i) => ({
      id: lineIds[i],
      order_id: orderId,
      product_id: line.product.id,
      product_name: line.product.name,
      quantity: line.quantity,
      unit_price: line.product.price,
      unit_cost: line.product.cost_price ?? null,
      line_total: cartLineTotal(line),
      order_discount_id: null,
      remarks: line.remarks,
    })),
  )
  if (linesError) throw new Error(`The order was created, but saving its items failed: ${linesError.message}`)

  const modifierRows = input.lines.flatMap((line, i) =>
    line.selections.map((option) => ({
      id: id(),
      order_line_id: lineIds[i],
      modifier_option_id: option.id,
      name: option.name,
      price_adjustment: option.price_adjustment,
      unit_cost_adjustment: option.cost_adjustment ?? null,
    })),
  )
  if (modifierRows.length > 0) {
    const { error: modifiersError } = await supabase.from('order_line_modifiers').insert(modifierRows)
    if (modifiersError) throw new Error(`The order was created, but saving its options failed: ${modifiersError.message}`)
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    id: id(),
    order_id: orderId,
    method: paymentMethod,
    amount_tendered: input.payment.method === 'cash' ? input.payment.tendered : total,
    change: input.payment.method === 'cash' ? input.payment.tendered - total : 0,
    gcash_reference: null,
    status: 'pending',
  })
  if (paymentError) throw new Error(`The order was created, but recording payment failed: ${paymentError.message}`)

  for (const line of input.lines) {
    const deductionQty = stockDeductionQty(line)
    if (deductionQty === 0) continue
    const delta = -deductionQty
    await adjustProductStock(line.product.id, delta)
    const { error: stockAdjError } = await supabase.from('stock_adjustments').insert({
      id: id(),
      product_id: line.product.id,
      delta,
      reason: 'sale',
      order_id: orderId,
      created_by: input.userId,
      note: null,
    })
    if (stockAdjError) {
      console.error(`Order ${orderId}: failed to record a stock adjustment for product ${line.product.id}`, stockAdjError)
    }
  }

  return orderId
}

/**
 * Cancels an in-progress (status: 'active') order: restores this order's own 'sale'
 * StockAdjustments (mirroring checkoutData.ts's voidOrder — finds them, reverses each
 * via adjustProductStock, logs a new 'void' row — which naturally no-ops for an order
 * that never deducted stock, e.g. an online order today, with no channel branching
 * needed), then sets status:'voided', kitchen_status:'cancelled', cancellation_reason.
 * Scoped to 'active' orders only: an already-'completed' order stays Register/Order
 * History's voidOrder() responsibility, so the two paths never race on the same row.
 */
export async function cancelOrder(orderId: string, reason: string, userId: string | null): Promise<void> {
  const { data: orderRow, error: fetchError } = await supabase.from('orders').select('*').eq('id', orderId).single()
  if (fetchError || !orderRow) throw new Error(`Failed to load the order: ${fetchError?.message ?? 'not found'}`)
  const order = orderRow as Order
  if (order.status !== 'active') {
    throw new Error(
      'Only an in-progress order can be cancelled here — a completed order must be voided from Order History instead.',
    )
  }

  const { data: saleAdjustments, error: saleError } = await supabase
    .from('stock_adjustments')
    .select('*')
    .eq('order_id', orderId)
    .eq('reason', 'sale')
  if (saleError) throw new Error(`Failed to load this order's stock records: ${saleError.message}`)

  for (const adjustment of (saleAdjustments ?? []) as StockAdjustment[]) {
    const restore = -adjustment.delta
    await adjustProductStock(adjustment.product_id, restore)
    const { error: voidAdjError } = await supabase.from('stock_adjustments').insert({
      id: id(),
      product_id: adjustment.product_id,
      delta: restore,
      reason: 'void',
      order_id: orderId,
      created_by: userId,
      note: null,
    })
    if (voidAdjError) {
      console.error(`Order ${orderId}: failed to record stock restoration for product ${adjustment.product_id}`, voidAdjError)
    }
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'voided', kitchen_status: 'cancelled', cancellation_reason: reason, updated_at: nowIso() })
    .eq('id', orderId)
  if (updateError) throw new Error(`Failed to cancel the order: ${updateError.message}`)
}

const EDITABLE_KITCHEN_STATUSES: Order['kitchen_status'][] = ['pending_confirmation', 'preparing']

function sameSelectionIds(a: CartLine, b: CartLine): boolean {
  const idsA = a.selections.map((s) => s.id).sort()
  const idsB = b.selections.map((s) => s.id).sort()
  return idsA.length === idsB.length && idsA.every((id, i) => id === idsB[i])
}

export interface OrderItemEditInput {
  /** The order's lines as seen when the edit flow opened — each CartLine.id is the real
   *  OrderLine.id, its product/selections are live Product/ModifierOption objects (same
   *  shape EditOrderItemsFlow.tsx already builds to seed the picker). */
  originalLines: CartLine[]
  /** The desired end state — a kept/modified line keeps its original id; a newly added
   *  line carries a fresh id() (see EditOrderItemsFlow.tsx's "Add to Cart" handler). */
  newLines: CartLine[]
}

/**
 * Applies an in-place edit to an online/phone order still in the kitchen queue: diffs
 * originalLines against newLines by id (missing = removed, unrecognized id = added,
 * matched id = kept/possibly modified), writes the resulting order_lines/
 * order_line_modifiers, recomputes orders.total, and stamps items_edited_at/
 * items_edit_note so /kitchen and Order Management's own live queues know to refetch
 * (and, on /kitchen, chime) — see kitchenSupabaseData.ts's useKitchenQueue and this
 * file's useOrderManagementQueue. Only channel: 'phone' orders get stock corrections
 * (reason: 'correction', reusing the compare-and-swap adjustProductStock helper above)
 * — see this feature's plan notes for why channel: 'online' orders don't: they never
 * deducted stock at creation either, and starting to track just the edited lines would
 * be a worse inconsistency than staying untracked for the whole order.
 */
export async function applyOrderItemEdit(orderId: string, input: OrderItemEditInput, userId: string | null): Promise<void> {
  const { data: orderRow, error: fetchError } = await supabase.from('orders').select('*').eq('id', orderId).single()
  if (fetchError || !orderRow) throw new Error(`Failed to load the order: ${fetchError?.message ?? 'not found'}`)
  const order = orderRow as Order
  if (order.channel === 'in_store') {
    throw new Error('Dine-in orders are edited from Register, not Order Management.')
  }
  if (!EDITABLE_KITCHEN_STATUSES.includes(order.kitchen_status)) {
    throw new Error('This order is no longer waiting to be prepared, so its items can no longer be edited here.')
  }
  if (input.newLines.length === 0) {
    throw new Error('An order must have at least one item — cancel it instead if it should have none.')
  }

  const originalById = new Map(input.originalLines.map((l) => [l.id, l]))
  const newById = new Map(input.newLines.map((l) => [l.id, l]))
  const removedIds = input.originalLines.map((l) => l.id).filter((lineId) => !newById.has(lineId))
  const addedLines = input.newLines.filter((l) => !originalById.has(l.id))
  const keptLines = input.newLines.filter((l) => originalById.has(l.id))
  const modifiedKeptLines = keptLines.filter((l) => {
    const original = originalById.get(l.id)!
    return original.quantity !== l.quantity || !sameSelectionIds(original, l)
  })

  if (removedIds.length > 0) {
    const { error: delModsError } = await supabase.from('order_line_modifiers').delete().in('order_line_id', removedIds)
    if (delModsError) throw new Error(`Failed to remove item options: ${delModsError.message}`)
    const { error: delLinesError } = await supabase.from('order_lines').delete().in('id', removedIds)
    if (delLinesError) throw new Error(`Failed to remove items: ${delLinesError.message}`)
  }

  for (const line of keptLines) {
    const { error: lineError } = await supabase
      .from('order_lines')
      .update({
        quantity: line.quantity,
        unit_price: line.product.price,
        unit_cost: line.product.cost_price ?? null,
        line_total: cartLineTotal(line),
      })
      .eq('id', line.id)
    if (lineError) throw new Error(`Failed to update an item: ${lineError.message}`)

    const { error: delModsError } = await supabase.from('order_line_modifiers').delete().eq('order_line_id', line.id)
    if (delModsError) throw new Error(`Failed to update an item's options: ${delModsError.message}`)
    if (line.selections.length > 0) {
      const { error: modsError } = await supabase.from('order_line_modifiers').insert(
        line.selections.map((option) => ({
          id: id(),
          order_line_id: line.id,
          modifier_option_id: option.id,
          name: option.name,
          price_adjustment: option.price_adjustment,
          unit_cost_adjustment: option.cost_adjustment ?? null,
        })),
      )
      if (modsError) throw new Error(`Failed to update an item's options: ${modsError.message}`)
    }
  }

  if (addedLines.length > 0) {
    const { error: addLinesError } = await supabase.from('order_lines').insert(
      addedLines.map((line) => ({
        id: line.id,
        order_id: orderId,
        product_id: line.product.id,
        product_name: line.product.name,
        quantity: line.quantity,
        unit_price: line.product.price,
        unit_cost: line.product.cost_price ?? null,
        line_total: cartLineTotal(line),
        order_discount_id: null,
        remarks: line.remarks,
      })),
    )
    if (addLinesError) throw new Error(`Failed to add new items: ${addLinesError.message}`)

    const modifierRows = addedLines.flatMap((line) =>
      line.selections.map((option) => ({
        id: id(),
        order_line_id: line.id,
        modifier_option_id: option.id,
        name: option.name,
        price_adjustment: option.price_adjustment,
        unit_cost_adjustment: option.cost_adjustment ?? null,
      })),
    )
    if (modifierRows.length > 0) {
      const { error: modsError } = await supabase.from('order_line_modifiers').insert(modifierRows)
      if (modsError) throw new Error(`Failed to add new items' options: ${modsError.message}`)
    }
  }

  const noteParts: string[] = []
  if (addedLines.length > 0) noteParts.push(`+${addedLines.length} item${addedLines.length === 1 ? '' : 's'}`)
  if (removedIds.length > 0) noteParts.push(`-${removedIds.length} item${removedIds.length === 1 ? '' : 's'}`)
  if (modifiedKeptLines.length > 0) noteParts.push(`${modifiedKeptLines.length} modified`)
  const itemsEditNote = noteParts.length > 0 ? noteParts.join(', ') : 'Items updated'

  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update({
      total: cartTotal(input.newLines),
      items_edited_at: nowIso(),
      items_edit_note: itemsEditNote,
      updated_at: nowIso(),
    })
    .eq('id', orderId)
  if (orderUpdateError) throw new Error(`Items were saved, but updating the order total failed: ${orderUpdateError.message}`)

  if (order.channel !== 'phone') return // online orders never deducted stock at creation — see this function's doc comment

  const affectedIds = new Set([...originalById.keys(), ...newById.keys()])
  for (const lineId of affectedIds) {
    const originalLine = originalById.get(lineId)
    const newLine = newById.get(lineId)
    const originalDeduction = originalLine ? stockDeductionQty(originalLine) : 0
    const newDeduction = newLine ? stockDeductionQty(newLine) : 0
    const correction = originalDeduction - newDeduction
    if (correction === 0) continue

    const productId = (newLine ?? originalLine)!.product.id
    await adjustProductStock(productId, correction)
    const { error: stockAdjError } = await supabase.from('stock_adjustments').insert({
      id: id(),
      product_id: productId,
      delta: correction,
      reason: 'correction',
      order_id: orderId,
      created_by: userId,
      note: `Order edit: ${itemsEditNote}`,
    })
    if (stockAdjError) {
      console.error(`Order ${orderId}: failed to record a stock correction for product ${productId}`, stockAdjError)
    }
  }
}
