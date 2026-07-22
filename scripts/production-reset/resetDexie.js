// ONE-TIME production reset script — local Dexie side. Deleted after use.
// Paste into the browser DevTools console while the app is loaded (window.db is
// exposed in dev builds). Mirrors the Supabase-side reset already applied by
// resetSupabase.mjs, so local data matches remote afterward.

const before = {
  orders: await db.orders.count(),
  orderLines: await db.orderLines.count(),
  orderLineModifiers: await db.orderLineModifiers.count(),
  payments: await db.payments.count(),
  stockAdjustments: await db.stockAdjustments.count(),
}

await db.transaction(
  'rw',
  db.orders,
  db.orderLines,
  db.orderLineModifiers,
  db.payments,
  db.stockAdjustments,
  db.products,
  async () => {
    await db.payments.clear()
    await db.orderLineModifiers.clear()
    await db.orderLines.clear()
    await db.stockAdjustments.clear()
    await db.orders.clear()

    const products = await db.products.toArray()
    const now = new Date().toISOString()
    for (const p of products) {
      if (p.stock_on_hand !== p.par_level) {
        await db.products.update(p.id, { stock_on_hand: p.par_level, sync_status: 'synced', updated_at: now })
      }
    }
  },
)

const after = {
  orders: await db.orders.count(),
  orderLines: await db.orderLines.count(),
  orderLineModifiers: await db.orderLineModifiers.count(),
  payments: await db.payments.count(),
  stockAdjustments: await db.stockAdjustments.count(),
}

const products = await db.products.toArray()
const mismatched = products.filter((p) => p.stock_on_hand !== p.par_level)
const lastOrder = await db.orders.orderBy('order_number').last()
const nextOrderNumber = (lastOrder?.order_number ?? 0) + 1

console.log('before:', before)
console.log('after:', after)
console.log('products at par level:', products.length - mismatched.length, '/', products.length)
console.log('next order number will be:', nextOrderNumber)
