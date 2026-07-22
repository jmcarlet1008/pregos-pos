import { db, type DiscountType, type OrderDiscount } from '../../db'
import { recalcOrderTotal } from './registerData'

function id() {
  return crypto.randomUUID()
}

function timestamps() {
  const now = new Date().toISOString()
  return { created_at: now, updated_at: now }
}

/**
 * Records a Senior Citizen / PWD discount claim on an order and tags the given lines as
 * that claim's exclusive coverage. A line can only belong to one claim at a time — callers
 * should only offer currently-untagged lines for selection.
 */
export async function addOrderDiscount(
  orderId: string,
  discountType: DiscountType,
  holderName: string,
  idNumber: string,
  lineIds: string[],
): Promise<void> {
  await db.transaction('rw', [db.orderDiscounts, db.orderLines, db.orders], async () => {
    const discount: OrderDiscount = {
      id: id(),
      order_id: orderId,
      discount_type: discountType,
      holder_name: holderName.trim(),
      id_number: idNumber.trim(),
      sync_status: 'pending',
      ...timestamps(),
    }
    await db.orderDiscounts.add(discount)
    const now = new Date().toISOString()
    for (const lineId of lineIds) {
      await db.orderLines.update(lineId, { order_discount_id: discount.id, updated_at: now })
    }
    await recalcOrderTotal(orderId)
  })
}

/** Un-tags every line under this claim and deletes it, then recomputes the order total. */
export async function removeOrderDiscount(discountId: string, orderId: string): Promise<void> {
  await db.transaction('rw', [db.orderDiscounts, db.orderLines, db.orders], async () => {
    const lines = await db.orderLines.where('order_discount_id').equals(discountId).toArray()
    const now = new Date().toISOString()
    for (const line of lines) {
      await db.orderLines.update(line.id, { order_discount_id: null, updated_at: now })
    }
    await db.orderDiscounts.delete(discountId)
    await recalcOrderTotal(orderId)
  })
}

export async function loadOrderDiscounts(orderId: string): Promise<OrderDiscount[]> {
  return db.orderDiscounts.where('order_id').equals(orderId).sortBy('created_at')
}
