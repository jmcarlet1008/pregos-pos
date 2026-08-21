import { useEffect, useMemo, useState } from 'react'
import type { ModifierGroup, ModifierOption, Product } from '../../db'
import { Button, Modal } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { vibrate } from '../../lib/haptics'

interface GroupWithOptions extends ModifierGroup {
  options: ModifierOption[]
}

function groupsForProduct(
  productId: string,
  modifierGroups: ModifierGroup[],
  modifierOptions: ModifierOption[],
): GroupWithOptions[] {
  return modifierGroups
    .filter((g) => g.product_id === productId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => ({
      ...group,
      options: modifierOptions
        .filter((o) => o.modifier_group_id === group.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
}

export interface CustomerLineModalProps {
  open: boolean
  product: Product
  modifierGroups: ModifierGroup[]
  modifierOptions: ModifierOption[]
  mode: 'add' | 'edit'
  initialSelectionIds?: string[]
  initialQuantity?: number
  initialRemarks?: string | null
  onClose: () => void
  onConfirm: (selections: ModifierOption[], quantity: number, remarks: string | null) => void
  onDelete?: () => void
}

/**
 * Customer-facing fork of Register's ProductOptionsModal (src/features/register/ProductOptionsModal.tsx):
 * same modifier-group picker behavior (single-pick groups act as radios, multi-pick as
 * checkboxes bounded by max_picks, required groups gate the confirm button), plus an
 * always-present optional Remarks field. Every product tap on /order opens this modal
 * — even with zero modifier groups — so there's always a moment to add remarks and
 * confirm quantity; unlike Register, it's also the only way to edit/remove a line
 * afterward (reopened in `mode: 'edit'`, pre-filled, with a Remove button).
 */
export function CustomerLineModal({
  open,
  product,
  modifierGroups,
  modifierOptions,
  mode,
  initialSelectionIds = [],
  initialQuantity = 1,
  initialRemarks = null,
  onClose,
  onConfirm,
  onDelete,
}: CustomerLineModalProps) {
  const groups = useMemo(
    () => groupsForProduct(product.id, modifierGroups, modifierOptions),
    [product.id, modifierGroups, modifierOptions],
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectionIds))
  const [quantity, setQuantity] = useState(initialQuantity)
  const [remarks, setRemarks] = useState(initialRemarks ?? '')

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set(initialSelectionIds))
    setQuantity(initialQuantity)
    setRemarks(initialRemarks ?? '')
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
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-sm">
            <span className="text-body-lg font-bold text-on-surface">{formatCurrency(total)}</span>
            <Button
              variant="primary"
              disabled={!isValid}
              onClick={() => {
                vibrate('tap')
                onConfirm(selectedOptions, quantity, remarks.trim() ? remarks.trim() : null)
              }}
            >
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

        <div className="flex flex-col gap-xs">
          <label htmlFor="line-remarks" className="text-label-bold text-on-surface">
            Special instructions <span className="font-normal text-on-surface-variant">(optional)</span>
          </label>
          <textarea
            id="line-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. extra crust, no onions"
            rows={2}
            className="w-full rounded-md border border-outline bg-surface-container-lowest px-md py-sm text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:border-2 focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  )
}
