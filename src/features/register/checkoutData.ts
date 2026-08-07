import { db, timestamps, touch, touchPatch, type Payment } from '../../db'
import type { CompletedPaymentInput } from '../payments/PaymentProvider'

function id() {
  return crypto.randomUUID()
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
): Promise<string> {
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
      await db.orders.put(touch({ ...order, status: 'completed', user_id: userId, completed_at }))

      return payment.id
    },
  )
}

/**
 * Voids a completed order and restores exactly the stock deducted at sale time,
 * reversing the order's own "sale" StockAdjustment records rather than recomputing
 * from current product/modifier definitions (which may have changed since the sale).
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
