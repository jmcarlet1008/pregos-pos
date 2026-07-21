import { db, type StockAdjustmentReason } from '../../db'

function id() {
  return crypto.randomUUID()
}

function timestamps() {
  const now = new Date().toISOString()
  return { created_at: now, updated_at: now }
}

export const REASON_LABELS: Record<StockAdjustmentReason, string> = {
  sale: 'Sale',
  void: 'Void restock',
  manual: 'Manual adjustment',
  delivery: 'Delivery',
  waste: 'Waste',
  correction: 'Correction',
}

export type ManualAdjustmentReason = Extract<StockAdjustmentReason, 'delivery' | 'waste' | 'correction'>

export interface ManualAdjustmentInput {
  delta: number
  reason: ManualAdjustmentReason
  note: string | null
}

/** Applies a manual stock count change (delivery/waste/correction) and logs the audit trail entry. */
export async function adjustStock(
  productId: string,
  input: ManualAdjustmentInput,
  userId: string | null,
): Promise<void> {
  await db.transaction('rw', [db.products, db.stockAdjustments], async () => {
    const product = await db.products.get(productId)
    if (!product) return
    await db.products.update(product.id, {
      stock_on_hand: product.stock_on_hand + input.delta,
      updated_at: new Date().toISOString(),
    })
    await db.stockAdjustments.add({
      id: id(),
      product_id: productId,
      delta: input.delta,
      reason: input.reason,
      order_id: null,
      created_by: userId,
      note: input.note,
      sync_status: 'pending',
      ...timestamps(),
    })
  })
}

export interface AuditLogRow {
  id: string
  delta: number
  reason: StockAdjustmentReason
  note: string | null
  createdAt: string
  createdByName: string | null
  orderNumber: number | null
}

/** Loads a product's StockAdjustment history, most recent first, with user/order names resolved for display. */
export async function loadAuditLog(productId: string): Promise<AuditLogRow[]> {
  const adjustments = await db.stockAdjustments.where('product_id').equals(productId).toArray()
  const rows = await Promise.all(
    adjustments.map(async (a) => {
      const user = a.created_by ? await db.users.get(a.created_by) : undefined
      const order = a.order_id ? await db.orders.get(a.order_id) : undefined
      return {
        id: a.id,
        delta: a.delta,
        reason: a.reason,
        note: a.note,
        createdAt: a.created_at,
        createdByName: user?.name ?? null,
        orderNumber: order?.order_number ?? null,
      }
    }),
  )
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
