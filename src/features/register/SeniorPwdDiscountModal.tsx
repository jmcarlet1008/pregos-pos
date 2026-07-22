import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type Category, type DiscountType, type Product } from '../../db'
import { Button, Input, Modal } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { CartLineWithModifiers } from './CartPanel'

const DRINK_PATTERN = /drink|beverage/i

export interface SeniorPwdDiscountModalProps {
  open: boolean
  /** Cart lines not already claimed under another discount — the only ones selectable here. */
  availableLines: CartLineWithModifiers[]
  onClose: () => void
  onConfirm: (discountType: DiscountType, holderName: string, idNumber: string, lineIds: string[]) => void
}

/** Pre-checks one likely drink line and one likely non-drink (entrée) line — a starting
 *  suggestion only. The cashier can freely add or remove lines since the real test is
 *  "this person's exclusive consumption," not a fixed item count. */
function suggestDefaultSelection(
  lines: CartLineWithModifiers[],
  categoryNameByProductId: Map<string, string>,
): Set<string> {
  const isDrink = (line: CartLineWithModifiers) => DRINK_PATTERN.test(categoryNameByProductId.get(line.product_id) ?? '')
  const drink = lines.find(isDrink)
  const entree = lines.find((line) => !isDrink(line))
  const selected = new Set<string>()
  if (drink) selected.add(drink.id)
  if (entree) selected.add(entree.id)
  return selected
}

export function SeniorPwdDiscountModal({ open, availableLines, onClose, onConfirm }: SeniorPwdDiscountModalProps) {
  const products = useLiveQuery(() => (open ? db.products.toArray() : Promise.resolve<Product[]>([])), [open]) ?? []
  const categories = useLiveQuery(() => (open ? db.categories.toArray() : Promise.resolve<Category[]>([])), [open]) ?? []

  const [discountType, setDiscountType] = useState<DiscountType>('senior')
  const [holderName, setHolderName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setDiscountType('senior')
    setHolderName('')
    setIdNumber('')
    setSelectedIds(new Set())
    // Reset only when the modal opens, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || products.length === 0 || categories.length === 0) return
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]))
    const categoryNameByProductId = new Map(products.map((p) => [p.id, categoryNameById.get(p.category_id) ?? '']))
    setSelectedIds(suggestDefaultSelection(availableLines, categoryNameByProductId))
    // Only recompute the suggestion when the modal opens / candidate lines change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, products.length, categories.length])

  function toggleLine(lineId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  const isValid = holderName.trim().length > 0 && idNumber.trim().length > 0 && selectedIds.size > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Senior/PWD Discount"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!isValid}
            onClick={() => onConfirm(discountType, holderName, idNumber, [...selectedIds])}
          >
            Apply Discount
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <fieldset className="flex flex-col gap-xs">
          <legend className="mb-xs text-label-bold text-on-surface">Discount Type</legend>
          <div className="grid grid-cols-2 gap-xs">
            {(['senior', 'pwd'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDiscountType(type)}
                aria-pressed={discountType === type}
                className={[
                  'min-h-touch rounded-md border px-sm text-body-md transition-colors',
                  discountType === type
                    ? 'border-primary bg-primary-fixed text-on-primary-fixed'
                    : 'border-outline text-on-surface hover:bg-surface-container',
                ].join(' ')}
              >
                {type === 'senior' ? 'Senior Citizen' : 'PWD'}
              </button>
            ))}
          </div>
        </fieldset>

        <Input
          label="Holder's Full Name"
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          placeholder="Juan Dela Cruz"
        />
        <Input
          label="ID Number"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
          placeholder="Senior Citizen / PWD ID number"
        />

        <fieldset className="flex flex-col gap-xs">
          <legend className="mb-xs text-label-bold text-on-surface">
            Items for this person's exclusive consumption
          </legend>
          {availableLines.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              No items available — every item is already covered by another discount.
            </p>
          ) : (
            <div className="flex flex-col gap-xs">
              {availableLines.map((line) => {
                const selected = selectedIds.has(line.id)
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => toggleLine(line.id)}
                    aria-pressed={selected}
                    className={[
                      'flex min-h-touch items-center justify-between rounded-md border px-sm text-body-md transition-colors',
                      selected
                        ? 'border-primary bg-primary-fixed text-on-primary-fixed'
                        : 'border-outline text-on-surface hover:bg-surface-container',
                    ].join(' ')}
                  >
                    <span>
                      {line.quantity}× {line.product_name}
                    </span>
                    <span>{formatCurrency(line.line_total)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </fieldset>
      </div>
    </Modal>
  )
}
