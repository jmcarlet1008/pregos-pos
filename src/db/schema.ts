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
  user_id: string | null
}

export interface OrderLine extends BaseEntity {
  order_id: string
  product_id: string
  product_name: string // snapshot at time of sale
  quantity: number
  unit_price: number // product price snapshot
  line_total: number // (unit_price + sum modifier adjustments) * quantity
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

class PregosDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  products!: EntityTable<Product, 'id'>
  modifierGroups!: EntityTable<ModifierGroup, 'id'>
  modifierOptions!: EntityTable<ModifierOption, 'id'>
  orders!: EntityTable<Order, 'id'>
  orderLines!: EntityTable<OrderLine, 'id'>
  orderLineModifiers!: EntityTable<OrderLineModifier, 'id'>
  payments!: EntityTable<Payment, 'id'>
  users!: EntityTable<User, 'id'>
  shifts!: EntityTable<Shift, 'id'>
  stockAdjustments!: EntityTable<StockAdjustment, 'id'>

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
      users: 'id, role, active, sync_status',
      shifts: 'id, user_id, status, sync_status',
      stockAdjustments: 'id, product_id, order_id, reason, sync_status',
    })
  }
}

export const db = new PregosDB()
