import {
  type Category,
  type DeliveryAddress,
  type FulfillmentType,
  type ModifierGroup,
  type ModifierOption,
  type Order,
  type Product,
  type PaymentMethod,
} from '../../db'
// Moved to src/lib/businessSettingsRemote.ts so src/features/kitchen/ (a second
// direct-Supabase consumer) can import them without reaching across the order/kitchen
// feature-folder boundary. Imported (not just re-exported) since assertStillAccepting
// below also calls fetchBusinessSettings itself; re-exported so OrderPage.tsx's existing
// imports don't need to change.
import { fetchBusinessSettings, subscribeBusinessSettings } from '../../lib/businessSettingsRemote'
// Same cross-feature-folder reuse orderManagementSupabaseData.ts already does for this
// function, rather than a second copy — see assignOrderNumberIfMissing's own doc
// comment (kitchenSupabaseData.ts) for why this needs the safe compare-and-swap
// approach and not a naive client-side "local max+1".
import { assignOrderNumberIfMissing } from '../kitchen/kitchenSupabaseData'
import { getInitialKitchenStatus } from '../../lib/orderWorkflow'
import { supabase } from '../../lib/supabaseClient'
import { evaluateOpenState } from './businessHours'
import { cartLineTotal, cartTotal, type CartLine } from './cartTypes'

export { fetchBusinessSettings, subscribeBusinessSettings }

function id() {
  return crypto.randomUUID()
}

export interface OnlineMenu {
  categories: Category[]
  products: Product[]
  modifierGroups: ModifierGroup[]
  modifierOptions: ModifierOption[]
}

/**
 * Live catalog read straight from Supabase — /order never reads Dexie (see main.tsx's
 * boot guard). Mirrors the same active/deleted_at filtering RegisterPage.tsx applies
 * to its Dexie reads (see SoftDeletable's comment in schema.ts: read call sites are
 * responsible for it). Also silently hides any tracked product that's out of stock —
 * unlike Register's staff-facing "Add Anyway" override, that confirmation flow doesn't
 * make sense for a public customer.
 */
export async function fetchMenu(): Promise<OnlineMenu> {
  const [categoriesRes, productsRes, groupsRes, optionsRes] = await Promise.all([
    supabase.from('categories').select('*'),
    supabase.from('products').select('*'),
    supabase.from('modifier_groups').select('*'),
    supabase.from('modifier_options').select('*'),
  ])
  for (const res of [categoriesRes, productsRes, groupsRes, optionsRes]) {
    if (res.error) throw new Error(`Failed to load the menu: ${res.error.message}`)
  }

  const categories = ((categoriesRes.data ?? []) as Category[])
    .filter((c) => c.active && !c.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
  const products = ((productsRes.data ?? []) as Product[])
    .filter((p) => p.active && !p.deleted_at && !(p.track_inventory && p.stock_on_hand <= 0))
    .sort((a, b) => a.sort_order - b.sort_order)
  const modifierGroups = ((groupsRes.data ?? []) as ModifierGroup[]).filter((g) => !g.deleted_at)
  const modifierOptions = ((optionsRes.data ?? []) as ModifierOption[]).filter((o) => !o.deleted_at)

  return { categories, products, modifierGroups, modifierOptions }
}

export type Fulfillment =
  | { type: 'pickup' }
  | {
      type: 'delivery'
      zoneName: string
      // The chosen zone's DeliveryZone.auto_route snapshot at order time — determines
      // whether this order auto-queues into 'preparing' or waits at
      // 'pending_confirmation' (see getInitialKitchenStatus below). Previously dropped
      // between DeliveryZoneStep and here (see OrderPage.tsx's handleZoneConfirm);
      // threading it through is what makes that routing decision possible at all.
      zoneAutoRoute: boolean
      address: DeliveryAddress
      lat: number | null
      lng: number | null
    }

export type PaymentInput = { method: 'cash'; tendered: number } | { method: 'gcash'; confirmed: true }

export interface SubmitOrderInput {
  lines: CartLine[]
  fulfillment: Fulfillment
  requestedTimeIso: string
  payment: PaymentInput
  customerName: string
  customerContact: string
}

/** Last-moment guard against a shop that closed in the middle of checkout. */
async function assertStillAccepting(): Promise<void> {
  const settings = await fetchBusinessSettings()
  if (!evaluateOpenState(settings).open) {
    throw new Error("Sorry, we just closed and can't accept new orders right now.")
  }
}

export interface SubmitOrderResult {
  orderId: string
  /** null only if the post-submission numbering round-trip itself failed — the order
   *  was still placed successfully either way. See this function's own comment. */
  orderNumber: number | null
}

/**
 * Writes an online order straight to Supabase: one `orders` row, its `order_lines`
 * (each carrying its own `remarks`), any `order_line_modifiers`, one `payments` row
 * (status 'pending' — cash is COD and GCash proof isn't verified until staff check
 * Messenger, so neither is "confirmed" yet the way an in-person Register sale is), and
 * finally a real order_number (see assignOrderNumberIfMissing) so OrderConfirmation.tsx
 * can show the customer the same number staff will see on /kitchen, not a placeholder.
 *
 * Plain sequential REST calls, not one DB transaction — there are no FK constraints in
 * this schema by design (see the note at the top of 20260722000000_init_schema.sql),
 * and the app already tolerates partial sync state elsewhere. A failure partway
 * through leaves at worst a harmless empty/partial `active` order, not corrupted data.
 */
export async function submitOnlineOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  await assertStillAccepting()

  const orderId = id()
  const total = cartTotal(input.lines)
  const fulfillmentType: FulfillmentType = input.fulfillment.type
  const paymentMethod: PaymentMethod = input.payment.method
  const kitchenStatus = getInitialKitchenStatus({
    channel: 'online',
    fulfillmentType,
    zoneAutoRoute: input.fulfillment.type === 'delivery' ? input.fulfillment.zoneAutoRoute : null,
  })

  const { error: orderError } = await supabase.from('orders').insert({
    id: orderId,
    order_number: null,
    status: 'active',
    total,
    shift_id: null,
    user_id: null,
    completed_at: null,
    prep_time_override_minutes: null,
    kitchen_status: kitchenStatus,
    queue_priority: null,
    channel: 'online',
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
  if (orderError) throw new Error(`Failed to place your order: ${orderError.message}`)

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
  if (linesError) throw new Error(`Your order was placed, but saving its items failed: ${linesError.message}`)

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
    if (modifiersError) throw new Error(`Your order was placed, but saving its options failed: ${modifiersError.message}`)
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
  if (paymentError) throw new Error(`Your order was placed, but recording payment failed: ${paymentError.message}`)

  // Assigned last, on purpose: the order/lines/modifiers/payment are all already
  // committed by this point, so if this one extra round-trip fails for any reason, the
  // order itself is still intact — OrderConfirmation.tsx just falls back to a
  // reference code derived from orderId instead of a real number. Minimal-shape cast:
  // assignOrderNumberIfMissing only ever reads .id/.order_number off what's passed in.
  let orderNumber: number | null = null
  try {
    const numbered = await assignOrderNumberIfMissing({ id: orderId, order_number: null } as Order)
    orderNumber = numbered.order_number
  } catch (err) {
    console.error('Failed to assign an order number — the order itself still went through', err)
  }

  return { orderId, orderNumber }
}
