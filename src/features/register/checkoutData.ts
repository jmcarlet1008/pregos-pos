import { db, timestamps, touch, touchPatch, type Payment } from '../../db'
import { getInitialKitchenStatus } from '../../lib/orderWorkflow'
import type { CompletedPaymentInput } from '../payments/PaymentProvider'

function id() {
  return crypto.randomUUID()
}

export interface WalkInCustomerInput {
  name: string
  contact: string
  note: string
}

export const EMPTY_WALK_IN_CUSTOMER: WalkInCustomerInput = { name: '', contact: '', note: '' }

/**
 * Register walk-in checks, applied only at the moment a new order is paid (never on
 * hold, void, reprint, or any existing order). Name: at least 2 characters once
 * trimmed. Contact: optional — empty is always fine; if entered, a lenient sanity check
 * only (digits, spaces, dashes, optional leading +, 7–13 digits), which covers
 * "0917 123 4567", "+63 917-123-4567" and landlines like "8123-4567".
 */
export function validateWalkInCustomer(input: Pick<WalkInCustomerInput, 'name' | 'contact'>): {
  nameError: string | null
  contactError: string | null
} {
  const nameError = input.name.trim().length < 2 ? 'Enter the customer’s name (at least 2 characters).' : null
  const contact = input.contact.trim()
  const digitCount = contact.replace(/\D/g, '').length
  const contactError =
    contact && (!/^\+?[\d\s-]+$/.test(contact) || digitCount < 7 || digitCount > 13)
      ? 'Use digits only, e.g. 0917 123 4567 or +63 917 123 4567.'
      : null
  return { nameError, contactError }
}

/**
 * Marks an order paid: records the Payment, then deducts stock per plan.md's
 * stock deduction rule (line quantity + any add-ons with deducts_stock) and logs
 * one StockAdjustment per line so a later void can reverse exactly what was taken.
 */
export async function completeOrder(
  orderId: string,
  input: CompletedPaymentInput,
  userId: string | null,
  customer: WalkInCustomerInput,
): Promise<string> {
  const { nameError, contactError } = validateWalkInCustomer(customer)
  if (nameError || contactError) throw new Error(nameError ?? contactError!)

  return db.transaction(
    'rw',
    [db.orders, db.orderLines, db.orderLineModifiers, db.modifierOptions, db.products, db.payments, db.stockAdjustments],
    async () => {
      const order = await db.orders.get(orderId)
      if (!order || order.status !== 'active') {
        throw new Error('Order is not active and cannot be paid.')
      }

      const payment: Payment = {
        id: id(),
        order_id: orderId,
        method: input.method,
        amount_tendered: input.amount_tendered,
        change: input.change,
        gcash_reference: input.gcash_reference,
        status: input.status,
        sync_status: 'pending',
        ...timestamps(),
      }
      await db.payments.add(payment)

      const lines = await db.orderLines.where('order_id').equals(orderId).toArray()
      for (const line of lines) {
        const product = await db.products.get(line.product_id)
        if (!product || !product.track_inventory) continue

        const modifiers = await db.orderLineModifiers.where('order_line_id').equals(line.id).toArray()
        let addonQty = 0
        for (const mod of modifiers) {
          const option = await db.modifierOptions.get(mod.modifier_option_id)
          if (option?.deducts_stock) addonQty += option.deduct_qty * line.quantity
        }

        const delta = -(line.quantity + addonQty)
        await db.products.update(product.id, touchPatch({ stock_on_hand: product.stock_on_hand + delta }))
        await db.stockAdjustments.add({
          id: id(),
          product_id: product.id,
          delta,
          reason: 'sale',
          order_id: orderId,
          created_by: userId,
          note: null,
          sync_status: 'pending',
          ...timestamps(),
        })
      }

      const completed_at = new Date().toISOString()
      // Dine-in enters the kitchen queue the moment payment completes — never sits at
      // 'pending_confirmation' (that's only for manual-confirmation delivery zones).
      const kitchen_status = getInitialKitchenStatus({ channel: 'in_store', fulfillmentType: null, zoneAutoRoute: null })
      // Customer details land on the order in the same write that completes it — only
      // ever this one active order being paid now, never an existing completed/voided one.
      await db.orders.put(
        touch({
          ...order,
          status: 'completed',
          user_id: userId,
          completed_at,
          kitchen_status,
          customer_name: customer.name.trim(),
          customer_contact: customer.contact.trim() || null,
          note: customer.note.trim() || null,
        }),
      )

      return payment.id
    },
  )
}

/**
 * Voids a completed order and restores exactly the stock deducted at sale time,
 * reversing the order's own "sale" StockAdjustment records rather than recomputing
 * from current product/modifier definitions (which may have changed since the sale).
 *
 * NOTE: /kitchen (and later /fulfillment) write kitchen_status/queue_priority directly
 * to Supabase, bypassing Dexie entirely — so this device's local copy of `order` can be
 * stale relative to those fields by the time a manager voids here. touch() below will
 * re-mark the row 'pending', and since orders is conflictAware (src/sync/tables.ts), the
 * next push either applies cleanly or — if the remote row genuinely diverged in the
 * meantime — gets frozen as a sync_conflicts row rather than silently clobbered (see
 * push.ts's pushConflictAware). Order Management (a future prompt, which also writes
 * queue_priority) should be aware a void can produce one of these; nothing further to
 * fix here since cancellation itself is explicitly out of scope for /kitchen.
 */
export async function voidOrder(orderId: string, userId: string | null): Promise<void> {
  await db.transaction('rw', [db.orders, db.products, db.stockAdjustments], async () => {
    const order = await db.orders.get(orderId)
    if (!order || order.status !== 'completed') {
      throw new Error('Only a completed order can be voided.')
    }

    const saleAdjustments = await db.stockAdjustments.where({ order_id: orderId, reason: 'sale' }).toArray()
    for (const adjustment of saleAdjustments) {
      const product = await db.products.get(adjustment.product_id)
      if (!product) continue
      const restore = -adjustment.delta
      await db.products.update(product.id, touchPatch({ stock_on_hand: product.stock_on_hand + restore }))
      await db.stockAdjustments.add({
        id: id(),
        product_id: product.id,
        delta: restore,
        reason: 'void',
        order_id: orderId,
        created_by: userId,
        note: null,
        sync_status: 'pending',
        ...timestamps(),
      })
    }

    await db.orders.put(touch({ ...order, status: 'voided' }))
  })
}
