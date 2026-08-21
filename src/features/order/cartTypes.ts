import type { ModifierOption, Product } from '../../db'

/**
 * One line in the customer's in-progress cart on /order. Plain client state, not
 * Dexie-backed — /order never touches Dexie (see main.tsx's boot guard) — and only
 * becomes real OrderLine/OrderLineModifier rows once submitOnlineOrder() runs. Every
 * "Add to Cart" confirm from CustomerLineModal creates a new CartLine rather than
 * merging into an existing one for the same product, unlike Register's
 * incrementSimpleLine: two additions of the same item may carry different remarks, so
 * they must stay independent lines.
 */
export interface CartLine {
  id: string // client-generated, local to this browser tab until submit
  product: Product
  selections: ModifierOption[]
  quantity: number
  remarks: string | null
}

/** Per-unit price including modifier adjustments (excludes quantity) — for display. */
export function cartLineUnitWithModifiers(line: CartLine): number {
  return line.product.price + line.selections.reduce((sum, option) => sum + option.price_adjustment, 0)
}

/**
 * Mirrors registerData.ts's lineTotal formula exactly ((unit_price + sum adjustments)
 * * quantity), duplicated in this tiny pure form rather than imported — importing
 * registerData.ts would pull in its module-level `db` (Dexie) import as a side effect,
 * which /order must avoid (see main.tsx's boot guard comment).
 */
export function cartLineTotal(line: CartLine): number {
  return cartLineUnitWithModifiers(line) * line.quantity
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + cartLineTotal(line), 0)
}
