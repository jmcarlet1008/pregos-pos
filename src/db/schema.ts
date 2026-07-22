import Dexie, { type EntityTable } from 'dexie'

export type SyncStatus = 'pending' | 'synced' | 'conflict'

export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
  sync_status: SyncStatus
}

export interface Category extends BaseEntity {
  name: string
  sort_order: number
  active: boolean
}

export interface Product extends BaseEntity {
  name: string
  category_id: string
  price: number // VAT-inclusive, ₱
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

export interface ModifierGroup extends BaseEntity {
  product_id: string
  name: string
  required: boolean
  min_picks: number
  max_picks: number
  sort_order: number
}

export interface ModifierOption extends BaseEntity {
  modifier_group_id: string
  name: string
  price_adjustment: number // VAT-inclusive, ₱
  deducts_stock: boolean
  deduct_qty: number
  sort_order: number
}

export type OrderStatus = 'active' | 'completed' | 'voided'

export interface Order extends BaseEntity {
  order_number: number
  status: OrderStatus
  total: number // sum of line totals, VAT-inclusive, no separate VAT line
  shift_id: string | null
  user_id: string | null // cashier who completed the sale
  completed_at: string | null // set once, at completion — unlike updated_at, not overwritten by a later void
}

export interface OrderLine extends BaseEntity {
  order_id: string
  product_id: string
  product_name: string // snapshot at time of sale
  quantity: number
  unit_price: number // product price snapshot
  line_total: number // (unit_price + sum modifier adjustments) * quantity
  order_discount_id: string | null // set when this line is claimed under a Senior/PWD discount (see OrderDiscount)
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

export interface BusinessSettings extends BaseEntity {
  name: string
  logo_url: string | null
  address: string
  phone: string
}

/** Fixed primary key — there is only ever one BusinessSettings record. */
export const BUSINESS_SETTINGS_ID = 'singleton'

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
