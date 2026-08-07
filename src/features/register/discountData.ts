import { db, timestamps, touchPatch, type DiscountType, type OrderDiscount } from '../../db'
import { recalcOrderTotal } from './registerData'

function id() {
  return crypto.randomUUID()
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
    for (const lineId of lineIds) {
      await db.orderLines.update(lineId, touchPatch({ order_discount_id: discount.id }))
    }
    await recalcOrderTotal(orderId)
  })
}

/** Un-tags every line under this claim and deletes it, then recomputes the order total. */
export async function removeOrderDiscount(discountId: string, orderId: string): Promise<void> {
  await db.transaction('rw', [db.orderDiscounts, db.orderLines, db.orders], async () => {
    const lines = await db.orderLines.where('order_discount_id').equals(discountId).toArray()
    for (const line of lines) {
      await db.orderLines.update(line.id, touchPatch({ order_discount_id: null }))
    }
    await db.orderDiscounts.delete(discountId)
    await recalcOrderTotal(orderId)
  })
}

export async function loadOrderDiscounts(orderId: string): Promise<OrderDiscount[]> {
  return db.orderDiscounts.where('order_id').equals(orderId).sortBy('created_at')
}
