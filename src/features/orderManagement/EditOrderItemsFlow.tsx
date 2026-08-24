import { useState } from 'react'
import type { Category, ModifierOption, Order, OrderLine, OrderLineModifier, Product } from '../../db'
import { Button, Modal } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { cartLineTotal, cartTotal, type CartLine } from '../order/cartTypes'
import { CategoryTabs } from '../register/CategoryTabs'
import { ProductGrid } from '../register/ProductGrid'
import { ProductOptionsModal } from '../register/ProductOptionsModal'
import { applyOrderItemEdit } from './orderManagementSupabaseData'

function id() {
  return crypto.randomUUID()
}

/**
 * Reconstructs the order's current lines as CartLine[] (live Product/ModifierOption
 * objects, not the order's own price/name snapshots) so they can flow through the same
 * add/edit/remove machinery AddManualOrderFlow.tsx already uses. Returns null — rather
 * than a partial result — if any line's product or any of its modifier selections can
 * no longer be resolved against the live catalog (e.g. the product was deleted after
 * this order was placed): editing via a stale/incomplete picker would be worse than not
 * offering it, so the caller shows an explanatory message instead in that rare case.
 */
function buildOriginalLines(
  lines: OrderLine[],
  modifiersByLineId: Map<string, OrderLineModifier[]>,
  products: Product[],
  modifierOptions: ModifierOption[],
): CartLine[] | null {
  const productById = new Map(products.map((p) => [p.id, p]))
  const modifierOptionById = new Map(modifierOptions.map((o) => [o.id, o]))
  const result: CartLine[] = []
  for (const line of lines) {
    const product = productById.get(line.product_id)
    if (!product) return null
    const selections: ModifierOption[] = []
    for (const mod of modifiersByLineId.get(line.id) ?? []) {
      const option = modifierOptionById.get(mod.modifier_option_id)
      if (!option) return null
      selections.push(option)
    }
    result.push({ id: line.id, product, selections, quantity: line.quantity, remarks: line.remarks })
  }
  return result
}

export interface EditOrderItemsFlowProps {
  order: Order
  lines: OrderLine[]
  modifiersByLineId: Map<string, OrderLineModifier[]>
  categories: Category[]
  products: Product[]
  modifierOptions: ModifierOption[]
  userId: string | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Full-page overlay for editing an online/phone order's items while it's still in the
 * kitchen queue — same shell/component-reuse pattern as AddManualOrderFlow.tsx
 * (Register's Dexie-aware ProductGrid/ProductOptionsModal/CategoryTabs), but seeded
 * from the order's existing lines instead of an empty cart, and gated behind a
 * confirmation modal before saving since this notifies the kitchen (see
 * applyOrderItemEdit's own doc comment for what "notifies" means concretely).
 */
export function EditOrderItemsFlow({
  order,
  lines,
  modifiersByLineId,
  categories,
  products,
  modifierOptions,
  userId,
  onClose,
  onSaved,
}: EditOrderItemsFlowProps) {
  const [originalLines] = useState(() => buildOriginalLines(lines, modifiersByLineId, products, modifierOptions))
  const [cart, setCart] = useState<CartLine[]>(() => originalLines ?? [])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [addModalProduct, setAddModalProduct] = useState<Product | null>(null)
  const [editingLine, setEditingLine] = useState<CartLine | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeCategories = categories.filter((c) => c.active && !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order)
  const activeProducts = products.filter((p) => p.active && !p.deleted_at).sort((a, b) => a.sort_order - b.sort_order)
  const visibleProducts = categoryId ? activeProducts.filter((p) => p.category_id === categoryId) : activeProducts

  function handleAddConfirm(selections: ModifierOption[], quantity: number) {
    if (!addModalProduct) return
    setCart((prev) => [...prev, { id: id(), product: addModalProduct, selections, quantity, remarks: null }])
    setAddModalProduct(null)
  }

  function handleEditConfirm(selections: ModifierOption[], quantity: number) {
    if (!editingLine) return
    setCart((prev) => prev.map((line) => (line.id === editingLine.id ? { ...line, selections, quantity } : line)))
    setEditingLine(null)
  }

  function handleDeleteLine() {
    if (!editingLine) return
    setCart((prev) => prev.filter((line) => line.id !== editingLine.id))
    setEditingLine(null)
  }

  async function handleSaveConfirmed() {
    if (!originalLines) return
    setSaving(true)
    setError(null)
    try {
      await applyOrderItemEdit(order.id, { originalLines, newLines: cart }, userId)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving these changes.')
      setSaving(false)
    }
  }

  if (originalLines === null) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-surface">
        <header className="flex min-h-touch shrink-0 items-center justify-between border-b border-surface-dim bg-surface-container-lowest px-md py-sm">
          <span className="text-headline-md text-on-surface">✏️ Edit Items — Order #{order.order_number ?? '—'}</span>
          <Button variant="ghost" onClick={onClose}>
            ✕ Close
          </Button>
        </header>
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-sm p-md text-center">
          <p className="text-body-lg text-on-surface">
            This order contains an item that's no longer in the menu, so it can't be edited here.
          </p>
          <p className="text-body-md text-on-surface-variant">
            Cancel it and create a fresh manual order instead if it needs to change.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-surface">
      <header className="flex min-h-touch shrink-0 items-center justify-between border-b border-surface-dim bg-surface-container-lowest px-md py-sm">
        <span className="text-headline-md text-on-surface">✏️ Edit Items — Order #{order.order_number ?? '—'}</span>
        <Button variant="ghost" onClick={onClose}>
          ✕ Close
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-md p-md">
        <div className="flex flex-col gap-xs">
          <p className="text-label-bold text-on-surface-variant">Current Items — tap to edit or remove</p>
          {cart.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No items yet — add something below.</p>
          ) : (
            <div className="flex flex-col gap-xs rounded-md border border-surface-dim bg-surface-container-lowest">
              {cart.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => setEditingLine(line)}
                  className="flex items-center justify-between gap-sm border-b border-surface-dim px-md py-sm text-left last:border-b-0 hover:bg-surface-container"
                >
                  <span className="text-body-md text-on-surface">
                    {line.quantity}× {line.product.name}
                    {line.selections.length > 0 && (
                      <span className="text-on-surface-variant"> ({line.selections.map((s) => s.name).join(', ')})</span>
                    )}
                  </span>
                  <span className="shrink-0 text-body-md font-bold text-on-surface">{formatCurrency(cartLineTotal(line))}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-sm">
          <p className="text-label-bold text-on-surface-variant">Add More Items</p>
          <CategoryTabs categories={activeCategories} selectedId={categoryId} onSelect={setCategoryId} />
          <div className="@container min-h-0 flex-1 overflow-y-auto pr-xs">
            <ProductGrid products={visibleProducts} onSelect={setAddModalProduct} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-sm border-t border-surface-dim pt-sm">
          <span className="text-body-lg font-bold text-on-surface">
            {cart.length} item{cart.length === 1 ? '' : 's'} · {formatCurrency(cartTotal(cart))}
          </span>
          <Button variant="primary" size="lg" disabled={cart.length === 0} onClick={() => setConfirming(true)}>
            Save Changes
          </Button>
        </div>
      </div>

      {addModalProduct && (
        <ProductOptionsModal
          open
          product={addModalProduct}
          mode="add"
          onClose={() => setAddModalProduct(null)}
          onConfirm={handleAddConfirm}
        />
      )}

      {editingLine && (
        <ProductOptionsModal
          open
          product={editingLine.product}
          mode="edit"
          initialSelectionIds={editingLine.selections.map((s) => s.id)}
          initialQuantity={editingLine.quantity}
          onClose={() => setEditingLine(null)}
          onConfirm={handleEditConfirm}
          onDelete={handleDeleteLine}
        />
      )}

      {confirming && (
        <Modal
          open
          onClose={() => (saving ? undefined : setConfirming(false))}
          title="Notify the kitchen?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>
                Never mind
              </Button>
              <Button variant="primary" onClick={handleSaveConfirmed} disabled={saving}>
                {saving ? 'Saving…' : 'Save & Notify Kitchen'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-sm">
            <p className="text-body-md text-on-surface-variant">
              This order is already in the kitchen queue. Saving will update its items and flag it as changed on the
              kitchen screen.
            </p>
            {error && <p className="text-body-md text-error">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
