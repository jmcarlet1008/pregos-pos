import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type ModifierGroup, type ModifierOption, type Product } from '../../db'
import { Button, Modal } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'

interface GroupWithOptions extends ModifierGroup {
  options: ModifierOption[]
}

async function loadGroups(productId: string): Promise<GroupWithOptions[]> {
  const groups = await db.modifierGroups.where('product_id').equals(productId).sortBy('sort_order')
  return Promise.all(
    groups.map(async (group) => ({
      ...group,
      options: await db.modifierOptions.where('modifier_group_id').equals(group.id).sortBy('sort_order'),
    })),
  )
}

export interface ProductOptionsModalProps {
  open: boolean
  product: Product
  mode: 'add' | 'edit'
  initialSelectionIds?: string[]
  initialQuantity?: number
  onClose: () => void
  onConfirm: (selections: ModifierOption[], quantity: number) => void
  onDelete?: () => void
}

export function ProductOptionsModal({
  open,
  product,
  mode,
  initialSelectionIds = [],
  initialQuantity = 1,
  onClose,
  onConfirm,
  onDelete,
}: ProductOptionsModalProps) {
  const groups = useLiveQuery(() => (open ? loadGroups(product.id) : undefined), [open, product.id]) ?? []
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectionIds))
  const [quantity, setQuantity] = useState(initialQuantity)

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set(initialSelectionIds))
    setQuantity(initialQuantity)
    // Reset only when the modal opens or the target product changes, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product.id])

  function toggleOption(group: GroupWithOptions, option: ModifierOption) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const isSelected = next.has(option.id)

      if (group.max_picks === 1) {
        for (const o of group.options) next.delete(o.id)
        if (!isSelected) next.add(option.id)
        return next
      }

      if (isSelected) {
        next.delete(option.id)
        return next
      }

      const selectedInGroup = group.options.filter((o) => next.has(o.id)).length
      if (group.max_picks > 0 && selectedInGroup >= group.max_picks) return prev

      next.add(option.id)
      return next
    })
  }

  const allOptions = groups.flatMap((g) => g.options)
  const selectedOptions = allOptions.filter((o) => selectedIds.has(o.id))
  const unitWithMods = product.price + selectedOptions.reduce((sum, o) => sum + o.price_adjustment, 0)
  const total = unitWithMods * quantity

  const isValid = groups.every((g) => {
    if (!g.required) return true
    const count = g.options.filter((o) => selectedIds.has(o.id)).length
    return count >= g.min_picks
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product.name}
      footer={
        <div className="flex w-full items-center justify-between gap-sm">
          {mode === 'edit' && onDelete ? (
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-sm">
            <span className="text-body-lg font-bold text-on-surface">{formatCurrency(total)}</span>
            <Button variant="primary" disabled={!isValid} onClick={() => onConfirm(selectedOptions, quantity)}>
              {mode === 'add' ? 'Add to Cart' : 'Save Changes'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-md">
        {product.description && <p className="text-body-md text-on-surface-variant">{product.description}</p>}

        <div className="flex items-center justify-between">
          <span className="text-label-bold text-on-surface">Quantity</span>
          <div className="flex items-center gap-sm">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="touch-target flex h-10 w-10 items-center justify-center rounded-full border border-outline text-headline-md text-on-surface hover:bg-surface-container"
            >
              −
            </button>
            <span className="w-8 text-center text-body-lg font-bold text-on-surface">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Increase quantity"
              className="touch-target flex h-10 w-10 items-center justify-center rounded-full border border-outline text-headline-md text-on-surface hover:bg-surface-container"
            >
              +
            </button>
          </div>
        </div>

        {groups.map((group) => (
          <fieldset key={group.id} className="flex flex-col gap-xs">
            <legend className="mb-xs flex items-baseline gap-xs text-label-bold text-on-surface">
              <span>
                {group.name}
                {group.required && <span className="text-error"> *</span>}
              </span>
              <span className="text-label-sm font-normal text-on-surface-variant">
                {group.required
                  ? `Pick ${group.min_picks === group.max_picks ? group.min_picks : `${group.min_picks}-${group.max_picks}`}`
                  : `Optional${group.max_picks > 0 ? ` · up to ${group.max_picks}` : ''}`}
              </span>
            </legend>
            <div className="flex flex-col gap-xs">
              {group.options.map((option) => {
                const selected = selectedIds.has(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleOption(group, option)}
                    aria-pressed={selected}
                    className={[
                      'flex min-h-touch items-center justify-between rounded-md border px-sm text-body-md transition-colors',
                      selected
                        ? 'border-primary bg-primary-fixed text-on-primary-fixed'
                        : 'border-outline text-on-surface hover:bg-surface-container',
                    ].join(' ')}
                  >
                    <span>{option.name}</span>
                    <span>{option.price_adjustment > 0 ? `+${formatCurrency(option.price_adjustment)}` : formatCurrency(0)}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  )
}
