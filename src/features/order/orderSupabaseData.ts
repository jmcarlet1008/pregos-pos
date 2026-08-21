import {
  BUSINESS_SETTINGS_ID,
  type BusinessSettings,
  type Category,
  type DeliveryAddress,
  type FulfillmentType,
  type ModifierGroup,
  type ModifierOption,
  type PaymentMethod,
  type Product,
} from '../../db'
import { supabase } from '../../lib/supabaseClient'
import { withDeliveryDefaults } from '../settings/businessData'
import { evaluateOpenState } from './businessHours'
import { cartLineTotal, cartTotal, type CartLine } from './cartTypes'

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

/**
 * `business_settings` has no `sync_status` column server-side (it's a local-only Dexie
 * concept — see schema.ts) — bolt on a placeholder so the row satisfies the shared
 * BusinessSettings type, same trick pull.ts uses when reading a remote row into Dexie.
 */
function toBusinessSettings(row: object): BusinessSettings {
  return withDeliveryDefaults({ ...row, sync_status: 'synced' } as BusinessSettings)
}

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  const { data, error } = await supabase.from('business_settings').select('*').eq('id', BUSINESS_SETTINGS_ID).single()
  if (error) throw new Error(`Failed to load business settings: ${error.message}`)
  return toBusinessSettings(data)
}

/**
 * Realtime: reacts instantly if staff flip Accepting Orders or edit the delivery
 * window while a customer already has /order open, instead of waiting on any poll.
 * Returns an unsubscribe function for a useEffect cleanup.
 */
export function subscribeBusinessSettings(onChange: (settings: BusinessSettings) => void): () => void {
  const channel = supabase
    .channel('public:business_settings')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'business_settings', filter: `id=eq.${BUSINESS_SETTINGS_ID}` },
      (payload) => onChange(toBusinessSettings(payload.new)),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export type Fulfillment =
  | { type: 'pickup' }
  | { type: 'delivery'; zoneName: string; address: DeliveryAddress; lat: number | null; lng: number | null }

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

/**
 * Writes an online order straight to Supabase: one `orders` row, its `order_lines`
 * (each carrying its own `remarks`), any `order_line_modifiers`, and one `payments`
 * row (status 'pending' — cash is COD and GCash proof isn't verified until staff check
 * Messenger, so neither is "confirmed" yet the way an in-person Register sale is).
 *
 * Plain sequential REST calls, not one DB transaction — there are no FK constraints in
 * this schema by design (see the note at the top of 20260722000000_init_schema.sql),
 * and the app already tolerates partial sync state elsewhere. A failure partway
 * through leaves at worst a harmless empty/partial `active` order, not corrupted data.
 */
export async function submitOnlineOrder(input: SubmitOrderInput): Promise<string> {
  await assertStillAccepting()

  const orderId = id()
  const total = cartTotal(input.lines)
  const fulfillmentType: FulfillmentType = input.fulfillment.type
  const paymentMethod: PaymentMethod = input.payment.method

  const { error: orderError } = await supabase.from('orders').insert({
    id: orderId,
    order_number: null,
    status: 'active',
    total,
    shift_id: null,
    user_id: null,
    completed_at: null,
    prep_time_override_minutes: null,
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

  return orderId
}
