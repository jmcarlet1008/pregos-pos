import Dexie, { type EntityTable } from 'dexie'

export type SyncStatus = 'pending' | 'synced' | 'conflict'

export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
  sync_status: SyncStatus
}

/**
 * Soft-delete marker used on catalog entities (Category/Product/ModifierGroup/
 * ModifierOption). These are the only entities the app lets a user hard-remove from
 * Menu Editor, and a plain Dexie `.delete()` only ever removes the row *locally* —
 * there's no delete propagation in the sync engine (pull.ts/push.ts only know how to
 * upsert). A hard-deleted row would keep living in Supabase forever and come right
 * back the next time any device did a full pull. Marking `deleted_at` instead turns a
 * delete into an ordinary field update, which the existing upsert-based sync already
 * handles correctly — no changes needed to pull/push. Read call sites are responsible
 * for filtering out rows where this is set; see e.g. MenuEditorPage/RegisterPage.
 */
export interface SoftDeletable {
  deleted_at: string | null
}

export interface Category extends BaseEntity, SoftDeletable {
  name: string
  sort_order: number
  active: boolean
}

export interface Product extends BaseEntity, SoftDeletable {
  name: string
  category_id: string
  price: number // VAT-inclusive, ₱
  cost_price: number | null // actual cost per unit, ₱; null = not yet entered — never treat as 0
  description: string
  image_url: string | null
  active: boolean
  sort_order: number
  // Inventory
  track_inventory: boolean
  stock_on_hand: number
  par_level: number
  reorder_point: number
  unit: string // e.g. 'pcs', 'lbs'
}

export interface ModifierGroup extends BaseEntity, SoftDeletable {
  product_id: string
  name: string
  required: boolean
  min_picks: number
  max_picks: number
  sort_order: number
}

export interface ModifierOption extends BaseEntity, SoftDeletable {
  modifier_group_id: string
  name: string
  price_adjustment: number // VAT-inclusive, ₱
  cost_adjustment: number | null // actual cost impact of this option, ₱; null = not yet
  // entered — never treat as 0. Can be negative, same as price_adjustment (e.g. a
  // downgrade that costs less).
  deducts_stock: boolean
  deduct_qty: number
  sort_order: number
}

export type OrderStatus = 'active' | 'completed' | 'voided'

/** Where an order originated: the in-store Register, or the public /order page. */
export type OrderChannel = 'in_store' | 'online'

export type FulfillmentType = 'pickup' | 'delivery'

/**
 * A structured address for an `auto_route` delivery zone (see DeliveryZone), typed by
 * a customer at checkout on /order. `type: 'freeform'` is used instead for a
 * manual-confirmation zone, where staff work out the exact address/logistics with the
 * customer over Messenger and a precise Block/Lot/Phase/Street isn't collected upfront.
 */
export interface StructuredDeliveryAddress {
  type: 'structured'
  block: string
  lot: string
  phase: string
  street: string
}

export interface FreeformDeliveryAddress {
  type: 'freeform'
  area: string
}

export type DeliveryAddress = StructuredDeliveryAddress | FreeformDeliveryAddress

export interface Order extends BaseEntity {
  // null until the order gets its first line — an empty cart (created on every app
  // boot/reload, see RegisterPage.tsx's init()) never consumes a real order number.
  // Assigned once, lazily, in registerData.ts's addOrderLine. See the 2026-08-20
  // incident notes in supabase/migrations/20260815010000_order_number_lazy.sql.
  // An online order (see `channel`) also starts with order_number: null and stays
  // that way through this app — a future staff-side view assigns it lazily too, for
  // the same collision-avoidance reason (see 20260821010000_add_online_order_fields.sql).
  order_number: number | null
  status: OrderStatus
  total: number // sum of line totals, VAT-inclusive, no separate VAT line
  shift_id: string | null
  user_id: string | null // cashier who completed the sale
  completed_at: string | null // set once, at completion — unlike updated_at, not overwritten by a later void
  // Per-order override for the Kitchen View's prep-start calculation (Prompt 12):
  // null means "use BusinessSettings.average_prep_time_minutes"; set this when a
  // specific order is bigger/more complex than average and needs more lead time.
  prep_time_override_minutes: number | null
  // ---- Online ordering (see supabase/migrations/20260821010000_add_online_order_fields.sql) ----
  channel: OrderChannel
  fulfillment_type: FulfillmentType | null // null for in-store orders
  delivery_zone: string | null // DeliveryZone.name snapshot at order time; null for pickup or in-store
  delivery_address: DeliveryAddress | null
  delivery_lat: number | null // optional Geolocation capture, supplementary to delivery_address
  delivery_lng: number | null
  requested_time: string | null // ISO datetime — chosen pickup/delivery time slot, today
  payment_method: PaymentMethod | null
  cash_tendered_amount: number | null // set when payment_method === 'cash'
  gcash_customer_confirmed: boolean | null // set when payment_method === 'gcash'
  customer_name: string | null
  customer_contact: string | null
}

export interface OrderLine extends BaseEntity {
  order_id: string
  product_id: string
  product_name: string // snapshot at time of sale
  quantity: number
  unit_price: number // product price snapshot
  unit_cost: number | null // product cost_price snapshot at time of sale; null if cost was unknown then
  line_total: number // (unit_price + sum modifier adjustments) * quantity
  order_discount_id: string | null // set when this line is claimed under a Senior/PWD discount (see OrderDiscount)
  remarks: string | null // optional special instructions, independent per line (see /order's CustomerLineModal)
}

export type DiscountType = 'senior' | 'pwd'

/**
 * A single Senior Citizen (RA 9994) or PWD (RA 10754) discount claim on an order.
 * One order can have multiple claims (e.g. two seniors at one table), each covering
 * only the OrderLines that reference its id via OrderLine.order_discount_id — the
 * statutory discount applies only to that person's own exclusive consumption, never
 * the whole order.
 */
export interface OrderDiscount extends BaseEntity {
  order_id: string
  discount_type: DiscountType
  holder_name: string
  id_number: string
}

export interface OrderLineModifier extends BaseEntity {
  order_line_id: string
  modifier_option_id: string
  name: string // snapshot
  price_adjustment: number // snapshot
  unit_cost_adjustment: number | null // ModifierOption.cost_adjustment snapshot at time
  // of sale; null if unknown then
}

export type PaymentMethod = 'cash' | 'gcash'
export type PaymentStatus = 'pending' | 'confirmed'

export interface Payment extends BaseEntity {
  order_id: string
  method: PaymentMethod
  amount_tendered: number
  change: number
  gcash_reference: string | null
  status: PaymentStatus
}

export type UserRole = 'cashier' | 'manager'

export interface User extends BaseEntity {
  name: string
  pin: string
  role: UserRole
  active: boolean
}

export type ShiftStatus = 'open' | 'closed'

export interface Shift extends BaseEntity {
  user_id: string
  clock_in: string
  clock_out: string | null
  status: ShiftStatus
}

export type StockAdjustmentReason = 'sale' | 'manual' | 'void' | 'delivery' | 'waste' | 'correction'

export interface StockAdjustment extends BaseEntity {
  product_id: string
  delta: number // +/-
  reason: StockAdjustmentReason
  order_id: string | null
  created_by: string | null
  note: string | null
}

/**
 * A single delivery area a customer can choose during online ordering.
 * `auto_route: true` — a free/standard zone: the order auto-routes straight to the
 * kitchen queue with a structured address form.
 * `auto_route: false` — an out-of-area zone: the order requires manual staff
 * confirmation via Messenger before it's allowed to enter the queue.
 * Manager-editable list (add/rename/remove) — see businessData.ts's
 * addDeliveryZone/renameDeliveryZone/removeDeliveryZone/setDeliveryZoneAutoRoute.
 */
export interface DeliveryZone {
  id: string
  name: string
  auto_route: boolean
}

export interface BusinessSettings extends BaseEntity {
  name: string
  logo_url: string | null
  address: string
  phone: string
  // ---- Online ordering: Delivery & Payment (see DeliveryPaymentSection.tsx) ----
  // These fields were added after the initial BusinessSettings table without a Dexie
  // .version() bump — none of them is ever queried by index, following the same
  // convention documented at the version(5) block below for the cost-tracking fields.
  // A BusinessSettings row seeded before this change will read these as `undefined`
  // on a device that hasn't touched Delivery & Payment yet; every read site must fall
  // back to the matching DEFAULT_* constant below rather than assume they're set.
  gcash_number: string
  gcash_qr_image: string | null // data URL, stored the same way as logo_url — see BusinessInfoSection's logo uploader
  // Instant manual Open/Closed switch for online ordering — independent of, and can
  // override, the scheduled delivery_start_time/delivery_end_time window below (e.g.
  // early closure, holiday, or running out of stock).
  accepting_orders_today: boolean
  // Bounds the automatic daily ordering window, settable per day by a Manager, e.g.
  // "Today's delivery runs 3:00 PM to 9:00 PM." 24h "HH:MM" strings.
  delivery_start_time: string
  delivery_end_time: string
  // How far apart the delivery time slots offered to customers are, in minutes.
  delivery_slot_interval_minutes: number
  // Used by the Kitchen View to calculate when an order needs to start being
  // prepared, based on its requested delivery/pickup time. See Order.prep_time_override_minutes
  // for the optional per-order override.
  average_prep_time_minutes: number
  delivery_zones: DeliveryZone[]
}

/** Fixed primary key — there is only ever one BusinessSettings record. */
export const BUSINESS_SETTINGS_ID = 'singleton'

export const DEFAULT_ACCEPTING_ORDERS_TODAY = true
export const DEFAULT_DELIVERY_START_TIME = '10:00'
export const DEFAULT_DELIVERY_END_TIME = '21:00'
export const DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES = 30
export const DEFAULT_AVERAGE_PREP_TIME_MINUTES = 15

/**
 * Fixed ids so a fresh local-first seed (seed.ts) and a fresh Supabase-first pull
 * (the delivery_zones column default in the matching migration) converge on the same
 * two starting zones — same rationale as seed.ts's SEED_IDS.
 */
export const DEFAULT_DELIVERY_ZONE_IDS = {
  withinCamella: '00000000-0000-4000-8000-000000000050',
  outsideCamella: '00000000-0000-4000-8000-000000000051',
} as const

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { id: DEFAULT_DELIVERY_ZONE_IDS.withinCamella, name: 'Within Camella', auto_route: true },
  { id: DEFAULT_DELIVERY_ZONE_IDS.outsideCamella, name: 'Outside Camella', auto_route: false },
]

/** Tracks the sync engine's pull cursor. Single row, key = SYNC_META_ID. */
export interface SyncMeta {
  id: string
  last_synced_at: string | null
}

export const SYNC_META_ID = 'singleton'

/**
 * Local cache of remote (Supabase Storage) product images, keyed by the URL stored
 * on Product.image_url, so photos still render while offline. Also holds
 * not-yet-uploaded images under a `local:<uuid>` pseudo-URL key when a photo is
 * taken while offline — the sync engine uploads those and rewrites the key once
 * back online.
 */
export interface ImageCacheEntry {
  url: string
  blob: Blob
  cached_at: string
}

class PregosDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  products!: EntityTable<Product, 'id'>
  modifierGroups!: EntityTable<ModifierGroup, 'id'>
  modifierOptions!: EntityTable<ModifierOption, 'id'>
  orders!: EntityTable<Order, 'id'>
  orderLines!: EntityTable<OrderLine, 'id'>
  orderLineModifiers!: EntityTable<OrderLineModifier, 'id'>
  orderDiscounts!: EntityTable<OrderDiscount, 'id'>
  payments!: EntityTable<Payment, 'id'>
  users!: EntityTable<User, 'id'>
  shifts!: EntityTable<Shift, 'id'>
  stockAdjustments!: EntityTable<StockAdjustment, 'id'>
  businessSettings!: EntityTable<BusinessSettings, 'id'>
  syncMeta!: EntityTable<SyncMeta, 'id'>
  imageCache!: EntityTable<ImageCacheEntry, 'url'>

  constructor() {
    super('pregos-pos')

    this.version(1).stores({
      categories: 'id, sort_order, active, sync_status',
      products: 'id, category_id, active, sort_order, sync_status',
      modifierGroups: 'id, product_id, sort_order, sync_status',
      modifierOptions: 'id, modifier_group_id, sort_order, sync_status',
      orders: 'id, order_number, status, shift_id, sync_status',
      orderLines: 'id, order_id, product_id, sync_status',
      orderLineModifiers: 'id, order_line_id, modifier_option_id, sync_status',
      payments: 'id, order_id, method, status, sync_status',
      users: 'id, pin, role, active, sync_status',
      shifts: 'id, user_id, status, sync_status',
      stockAdjustments: 'id, product_id, order_id, reason, sync_status',
    })

    this.version(2).stores({
      categories: 'id, sort_order, active, sync_status',
      products: 'id, category_id, active, sort_order, sync_status',
      modifierGroups: 'id, product_id, sort_order, sync_status',
      modifierOptions: 'id, modifier_group_id, sort_order, sync_status',
      orders: 'id, order_number, status, shift_id, sync_status',
      orderLines: 'id, order_id, product_id, sync_status',
      orderLineModifiers: 'id, order_line_id, modifier_option_id, sync_status',
      payments: 'id, order_id, method, status, sync_status',
      users: 'id, pin, role, active, sync_status',
      shifts: 'id, user_id, status, sync_status',
      stockAdjustments: 'id, product_id, order_id, reason, sync_status',
      businessSettings: 'id',
    })

    this.version(3).stores({
      categories: 'id, sort_order, active, sync_status',
      products: 'id, category_id, active, sort_order, sync_status',
      modifierGroups: 'id, product_id, sort_order, sync_status',
      modifierOptions: 'id, modifier_group_id, sort_order, sync_status',
      orders: 'id, order_number, status, shift_id, sync_status',
      orderLines: 'id, order_id, product_id, sync_status',
      orderLineModifiers: 'id, order_line_id, modifier_option_id, sync_status',
      payments: 'id, order_id, method, status, sync_status',
      users: 'id, pin, role, active, sync_status',
      shifts: 'id, user_id, status, sync_status',
      stockAdjustments: 'id, product_id, order_id, reason, sync_status',
      businessSettings: 'id',
      syncMeta: 'id',
      imageCache: 'url, cached_at',
    })

    // v3 left businessSettings un-indexed on sync_status; the sync engine queries every
    // table with .where('sync_status'), which Dexie requires an index for.
    this.version(4).stores({
      categories: 'id, sort_order, active, sync_status',
      products: 'id, category_id, active, sort_order, sync_status',
      modifierGroups: 'id, product_id, sort_order, sync_status',
      modifierOptions: 'id, modifier_group_id, sort_order, sync_status',
      orders: 'id, order_number, status, shift_id, sync_status',
      orderLines: 'id, order_id, product_id, sync_status',
      orderLineModifiers: 'id, order_line_id, modifier_option_id, sync_status',
      payments: 'id, order_id, method, status, sync_status',
      users: 'id, pin, role, active, sync_status',
      shifts: 'id, user_id, status, sync_status',
      stockAdjustments: 'id, product_id, order_id, reason, sync_status',
      businessSettings: 'id, sync_status',
      syncMeta: 'id',
      imageCache: 'url, cached_at',
    })

    // v5 adds Senior Citizen / PWD discount support: a new orderDiscounts table, and an
    // order_discount_id index on orderLines so a discount's covered lines can be queried.
    // Purely additive — existing rows simply have no order_discount_id, which reads as
    // "not discounted" everywhere it's checked.
    //
    // NOTE: Product.cost_price, OrderLine.unit_cost, ModifierOption.cost_adjustment, and
    // OrderLineModifier.unit_cost_adjustment (cost-tracking / profit reporting) were added
    // later without a new .version() bump. .stores() strings only declare *indexed*
    // columns — none of these fields is ever queried by index, so Dexie reads/writes them
    // fine as plain fields at this version. A version bump here would be a no-op stores()
    // diff, which would break this file's own convention (every bump above pairs with an
    // actual index change) more than it would help. Existing rows simply have these
    // fields === undefined until touched, which the app treats as unknown (same as an
    // explicit null) everywhere cost is read.
    this.version(5).stores({
      categories: 'id, sort_order, active, sync_status',
      products: 'id, category_id, active, sort_order, sync_status',
      modifierGroups: 'id, product_id, sort_order, sync_status',
      modifierOptions: 'id, modifier_group_id, sort_order, sync_status',
      orders: 'id, order_number, status, shift_id, sync_status',
      orderLines: 'id, order_id, product_id, order_discount_id, sync_status',
      orderLineModifiers: 'id, order_line_id, modifier_option_id, sync_status',
      orderDiscounts: 'id, order_id, sync_status',
      payments: 'id, order_id, method, status, sync_status',
      users: 'id, pin, role, active, sync_status',
      shifts: 'id, user_id, status, sync_status',
      stockAdjustments: 'id, product_id, order_id, reason, sync_status',
      businessSettings: 'id, sync_status',
      syncMeta: 'id',
      imageCache: 'url, cached_at',
    })
  }
}

export const db = new PregosDB()
