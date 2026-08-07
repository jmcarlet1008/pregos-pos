import { db, timestamps, touch, type ModifierOption, type Order, type OrderLine, type Product } from '../../db'
import { seniorPwdDiscountedPrice } from '../../lib/discount'

function id() {
  return crypto.randomUUID()
}

export function lineTotal(unitPrice: number, adjustments: number[], quantity: number): number {
  return (unitPrice + adjustments.reduce((sum, a) => sum + a, 0)) * quantity
}

export type StockStatus = 'ok' | 'low' | 'out'

export function stockStatus(product: Product): StockStatus {
  if (!product.track_inventory) return 'ok'
  if (product.stock_on_hand <= 0) return 'out'
  if (product.stock_on_hand <= product.reorder_point) return 'low'
  return 'ok'
}

async function getNextOrderNumber(): Promise<number> {
  const last = await db.orders.orderBy('order_number').last()
  return (last?.order_number ?? 0) + 1
}

/** Creates a new active order and returns its id. */
export async function createOrder(): Promise<string> {
  const order_number = await getNextOrderNumber()
  const order: Order = {
    id: id(),
    order_number,
    status: 'active',
    total: 0,
    shift_id: null,
    user_id: null,
    completed_at: null,
    sync_status: 'pending',
    ...timestamps(),
  }
  await db.orders.add(order)
  return order.id
}

/**
 * Cancels an active (never-completed) order by marking it voided. No stock was ever
 * deducted for an active order, so there's nothing to restore — this just needs the
 * order to stop showing as "active"/held. A status change (not a hard delete) so it
 * syncs like any other edit; a hard local delete would never propagate to Supabase
 * (there's no delete-sync for orders) and the order would just come back on the next
 * pull to a fresh device — see main.tsx/seed.ts's comments on the same problem for
 * categories/products.
 */
export async function cancelOrder(orderId: string): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order || order.status !== 'active') return
  await db.orders.put(touch({ ...order, status: 'voided' }))
}

/** Cancels an order only if it has no lines yet — used to clean up abandoned empty carts. */
export async function cancelOrderIfEmpty(orderId: string): Promise<void> {
  const lineCount = await db.orderLines.where('order_id').equals(orderId).count()
  if (lineCount > 0) return
  await cancelOrder(orderId)
}

/**
 * Cancels every other empty active order still lying around — abandoned carts left by
 * a previous session that closed or reloaded without ever explicitly holding or
 * switching away from them (so cancelOrderIfEmpty never got a chance to run). Call
 * once per app boot so these don't keep piling up in the Held Orders list.
 */
export async function cleanupAbandonedEmptyOrders(keepOrderId: string): Promise<void> {
  const active = await db.orders.where('status').equals('active').toArray()
  await Promise.all(active.filter((o) => o.id !== keepOrderId).map((o) => cancelOrderIfEmpty(o.id)))
}

/** What this line actually charges: full price, or the flat 20% Senior/PWD discount if tagged. */
export function lineChargeAmount(line: OrderLine): number {
  return line.order_discount_id ? seniorPwdDiscountedPrice(line.line_total) : line.line_total
}

export async function recalcOrderTotal(orderId: string): Promise<void> {
  const lines = await db.orderLines.where('order_id').equals(orderId).toArray()
  const total = lines.reduce((sum, line) => sum + lineChargeAmount(line), 0)
  const order = await db.orders.get(orderId)
  if (!order) return
  await db.orders.put(touch({ ...order, total }))
}

/** Adds a new line to an order for the given product + selected modifier options. */
export async function addOrderLine(
  orderId: string,
  product: Product,
  selections: ModifierOption[],
  quantity: number,
): Promise<void> {
  await db.transaction('rw', [db.orderLines, db.orderLineModifiers, db.orders], async () => {
    const unit_price = product.price
    const total = lineTotal(
      unit_price,
      selections.map((s) => s.price_adjustment),
      quantity,
    )
    const line: OrderLine = {
      id: id(),
      order_id: orderId,
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price,
      line_total: total,
      order_discount_id: null,
      sync_status: 'pending',
      ...timestamps(),
    }
    await db.orderLines.add(line)
    if (selections.length > 0) {
      await db.orderLineModifiers.bulkAdd(
        selections.map((option) => ({
          id: id(),
          order_line_id: line.id,
          modifier_option_id: option.id,
          name: option.name,
          price_adjustment: option.price_adjustment,
          sync_status: 'pending' as const,
          ...timestamps(),
        })),
      )
    }
    await recalcOrderTotal(orderId)
  })
}

/** Increments the quantity of an existing simple (no-modifier) line for a product, or returns false if none exists. */
export async function incrementSimpleLine(orderId: string, productId: string): Promise<boolean> {
  return db.transaction('rw', [db.orderLines, db.orderLineModifiers, db.orders], async () => {
    const candidates = await db.orderLines.where({ order_id: orderId, product_id: productId }).toArray()
    for (const line of candidates) {
      const modCount = await db.orderLineModifiers.where('order_line_id').equals(line.id).count()
      if (modCount === 0) {
        const quantity = line.quantity + 1
        await db.orderLines.put(
          touch({ ...line, quantity, line_total: lineTotal(line.unit_price, [], quantity) }),
        )
        await recalcOrderTotal(orderId)
        return true
      }
    }
    return false
  })
}

/** Replaces the quantity and selected modifiers for an existing line, and recomputes its total. */
export async function updateOrderLine(
  lineId: string,
  selections: ModifierOption[],
  quantity: number,
): Promise<void> {
  await db.transaction('rw', [db.orderLines, db.orderLineModifiers, db.orders], async () => {
    const line = await db.orderLines.get(lineId)
    if (!line) return
    await db.orderLineModifiers.where('order_line_id').equals(lineId).delete()
    if (selections.length > 0) {
      await db.orderLineModifiers.bulkAdd(
        selections.map((option) => ({
          id: id(),
          order_line_id: lineId,
          modifier_option_id: option.id,
          name: option.name,
          price_adjustment: option.price_adjustment,
          sync_status: 'pending' as const,
          ...timestamps(),
        })),
      )
    }
    const total = lineTotal(
      line.unit_price,
      selections.map((s) => s.price_adjustment),
      quantity,
    )
    await db.orderLines.put(touch({ ...line, quantity, line_total: total }))
    await recalcOrderTotal(line.order_id)
  })
}

/**
 * Deletes a line and its modifiers, then recomputes the order total. If the line was the
 * last one claimed under a Senior/PWD discount, that now-empty OrderDiscount is deleted too,
 * so a holder with zero covered items never lingers on the receipt or in Analytics.
 */
export async function deleteOrderLine(lineId: string): Promise<void> {
  await db.transaction('rw', [db.orderLines, db.orderLineModifiers, db.orders, db.orderDiscounts], async () => {
    const line = await db.orderLines.get(lineId)
    if (!line) return
    await db.orderLineModifiers.where('order_line_id').equals(lineId).delete()
    await db.orderLines.delete(lineId)
    if (line.order_discount_id) {
      const remaining = await db.orderLines.where('order_discount_id').equals(line.order_discount_id).count()
      if (remaining === 0) await db.orderDiscounts.delete(line.order_discount_id)
    }
    await recalcOrderTotal(line.order_id)
  })
}
