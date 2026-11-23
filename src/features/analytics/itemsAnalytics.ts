import type {
  Category,
  ModifierGroup,
  ModifierOption,
  Order,
  OrderDiscount,
  OrderLine,
  OrderLineModifier,
  Product,
} from '../../db'
// Explicit .ts extension: this module is also loaded directly by Node's built-in test
// runner (itemsAnalytics.test.ts, `npm test`), which doesn't resolve extensionless imports.
import { orderTimestamp } from '../../lib/dateRange.ts'

/**
 * Item- and category-level reporting for the Analytics tab (Prompt 16.5). Read-only and
 * pure: every function here takes already-loaded rows and returns numbers — nothing
 * writes anywhere, and nothing here feeds the existing Gross Sales/VAT/BIR/channel
 * figures in analyticsData.ts, which stay exactly as they were.
 *
 * Nothing is keyed off product, category, flavor or size NAMES. Everything derives from
 * the menu data:
 * - A line's category is its product's category_id (the product row is kept, soft-deleted,
 *   after removal from the menu, so old sales still resolve). A line whose product can't
 *   be found at all lands in "Uncategorized" rather than being dropped.
 * - Each line counts once, under its own product's category only. A combo is just a
 *   product in whichever category it's filed under; whatever was picked inside it is
 *   recorded as modifiers ON the combo line, never as separate pizza/pasta/chicken lines,
 *   so combo contents can't be double-counted in those categories.
 * - A category's "size/version" dimension is the single-choice modifier group
 *   (max_picks === 1) shared by the most products in it — e.g. "Size" on the pizzas.
 *   A line's value is the option snapshot it was sold with; a line with no option from
 *   that group shows as "<Group> not recorded" instead of being guessed, so the parts
 *   always add up to the category total.
 *
 * Quantities are line quantities (2× Pepperoni = 2). Sales are line_total (pre-Senior/PWD
 * discount), the same convention as the existing Top Menu Items list — see
 * analyticsData.ts's note on why that differs from the order-total-based Gross Sales.
 */

export const UNCATEGORIZED_ID = '__uncategorized__'

export interface MenuData {
  categories: Category[]
  products: Product[]
  modifierGroups: ModifierGroup[]
  modifierOptions: ModifierOption[]
}

interface CategoryInfo {
  id: string
  name: string
  sortOrder: number
  /** Shown even with zero sales: active and not deleted. */
  listed: boolean
}

export interface MenuIndex {
  categoryIdOf(productId: string): string
  category(categoryId: string): CategoryInfo
  listedCategoryIds(): string[]
  /** Display name of the category's size/version group, or null if it has none. */
  dimensionOf(categoryId: string): string | null
  /** The size/version a line was sold as; null when its category has no dimension. */
  variantOf(categoryId: string, lineModifiers: OrderLineModifier[]): { name: string; notRecorded: boolean } | null
  productName(productId: string, fallback: string): string
  /** Products currently on the menu (active, not deleted) — slow-mover candidates. */
  activeProductsIn(categoryId: string): Product[]
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export function buildMenuIndex(menu: MenuData): MenuIndex {
  const categoryById = new Map(menu.categories.map((c) => [c.id, c]))
  const productById = new Map(menu.products.map((p) => [p.id, p]))
  const groupById = new Map(menu.modifierGroups.map((g) => [g.id, g]))
  const optionById = new Map(menu.modifierOptions.map((o) => [o.id, o]))

  const productsByCategory = new Map<string, Product[]>()
  for (const p of menu.products) {
    const categoryId = categoryById.has(p.category_id) ? p.category_id : UNCATEGORIZED_ID
    const list = productsByCategory.get(categoryId) ?? []
    list.push(p)
    productsByCategory.set(categoryId, list)
  }

  const groupsByProduct = new Map<string, ModifierGroup[]>()
  for (const g of menu.modifierGroups) {
    const list = groupsByProduct.get(g.product_id) ?? []
    list.push(g)
    groupsByProduct.set(g.product_id, list)
  }

  // Per category: the single-choice group name shared by the most products.
  const dimensionByCategory = new Map<string, { key: string; display: string } | null>()
  for (const [categoryId, products] of productsByCategory) {
    const tally = new Map<string, { display: string; productCount: number; sortOrder: number; live: boolean }>()
    for (const p of products) {
      const seen = new Set<string>()
      for (const g of groupsByProduct.get(p.id) ?? []) {
        if (g.max_picks !== 1) continue
        const key = normalize(g.name)
        if (!key || seen.has(key)) continue
        seen.add(key)
        const live = !g.deleted_at
        const existing = tally.get(key)
        if (!existing) {
          tally.set(key, { display: g.name.trim(), productCount: 1, sortOrder: g.sort_order, live })
        } else {
          existing.productCount += 1
          existing.sortOrder = Math.min(existing.sortOrder, g.sort_order)
          // Prefer the spelling from a group that's still on the menu.
          if (live && !existing.live) Object.assign(existing, { display: g.name.trim(), live })
        }
      }
    }
    const best = [...tally.entries()].sort(
      ([ka, a], [kb, b]) => b.productCount - a.productCount || a.sortOrder - b.sortOrder || ka.localeCompare(kb),
    )[0]
    dimensionByCategory.set(categoryId, best ? { key: best[0], display: best[1].display } : null)
  }

  function categoryIdOf(productId: string): string {
    const product = productById.get(productId)
    return product && categoryById.has(product.category_id) ? product.category_id : UNCATEGORIZED_ID
  }

  return {
    categoryIdOf,
    category(categoryId) {
      const c = categoryById.get(categoryId)
      if (!c) return { id: UNCATEGORIZED_ID, name: 'Uncategorized', sortOrder: Number.MAX_SAFE_INTEGER, listed: false }
      return { id: c.id, name: c.name, sortOrder: c.sort_order, listed: c.active && !c.deleted_at }
    },
    listedCategoryIds() {
      return menu.categories.filter((c) => c.active && !c.deleted_at).map((c) => c.id)
    },
    dimensionOf(categoryId) {
      return dimensionByCategory.get(categoryId)?.display ?? null
    },
    variantOf(categoryId, lineModifiers) {
      const dimension = dimensionByCategory.get(categoryId)
      if (!dimension) return null
      for (const mod of lineModifiers) {
        const option = optionById.get(mod.modifier_option_id)
        const group = option ? groupById.get(option.modifier_group_id) : undefined
        if (group && normalize(group.name) === dimension.key && mod.name.trim()) {
          return { name: mod.name.trim(), notRecorded: false }
        }
      }
      return { name: `${dimension.display} not recorded`, notRecorded: true }
    },
    productName(productId, fallback) {
      return productById.get(productId)?.name ?? fallback
    },
    activeProductsIn(categoryId) {
      return (productsByCategory.get(categoryId) ?? []).filter((p) => p.active && !p.deleted_at)
    },
  }
}

export interface VariantCount {
  name: string
  quantity: number
  sales: number
  notRecorded: boolean
}

export interface ItemSummary {
  productId: string
  name: string
  quantity: number
  sales: number
  /** Share of the category's total quantity, 0–100. */
  shareOfCategory: number
  /** Size/version split for this item (empty when the category has no dimension). */
  variants: VariantCount[]
}

export interface CategorySummary {
  id: string
  name: string
  sortOrder: number
  quantity: number
  sales: number
  /** e.g. "Size"; null when this category has no size/version group. */
  dimension: string | null
  variants: VariantCount[]
  /** Ranked: quantity desc, then sales desc. */
  items: ItemSummary[]
  /** Items on the menu that sold 0–1 in the range, fewest first. */
  slowMovers: { productId: string; name: string; quantity: number }[]
}

export interface ItemAnalytics {
  categories: CategorySummary[]
  totalQuantity: number
  totalSales: number
}

export const SLOW_MOVER_MAX_QTY = 1

function sortVariants(variants: Iterable<VariantCount>): VariantCount[] {
  return [...variants].sort(
    (a, b) => Number(a.notRecorded) - Number(b.notRecorded) || b.quantity - a.quantity || a.name.localeCompare(b.name),
  )
}

function addVariant(map: Map<string, VariantCount>, variant: { name: string; notRecorded: boolean }, qty: number, sales: number) {
  const existing = map.get(variant.name) ?? { name: variant.name, quantity: 0, sales: 0, notRecorded: variant.notRecorded }
  existing.quantity += qty
  existing.sales += sales
  map.set(variant.name, existing)
}

/**
 * Per-category quantity/sales, size/version split, ranked items and slow movers for the
 * lines of `orders` (callers pass completed orders already narrowed to the date range
 * and channel filters — voided/cancelled orders never reach here).
 */
export function computeItemAnalytics(
  orders: Order[],
  orderLines: OrderLine[],
  orderLineModifiers: OrderLineModifier[],
  menu: MenuIndex,
): ItemAnalytics {
  const orderIds = new Set(orders.map((o) => o.id))
  const modifiersByLine = new Map<string, OrderLineModifier[]>()
  for (const mod of orderLineModifiers) {
    const list = modifiersByLine.get(mod.order_line_id) ?? []
    list.push(mod)
    modifiersByLine.set(mod.order_line_id, list)
  }

  interface Acc {
    quantity: number
    sales: number
    variants: Map<string, VariantCount>
    items: Map<string, { name: string; quantity: number; sales: number; variants: Map<string, VariantCount> }>
  }
  const byCategory = new Map<string, Acc>()
  const accFor = (categoryId: string): Acc => {
    let acc = byCategory.get(categoryId)
    if (!acc) {
      acc = { quantity: 0, sales: 0, variants: new Map(), items: new Map() }
      byCategory.set(categoryId, acc)
    }
    return acc
  }
  for (const categoryId of menu.listedCategoryIds()) accFor(categoryId)

  let totalQuantity = 0
  let totalSales = 0
  for (const line of orderLines) {
    if (!orderIds.has(line.order_id)) continue
    const categoryId = menu.categoryIdOf(line.product_id)
    const acc = accFor(categoryId)
    acc.quantity += line.quantity
    acc.sales += line.line_total
    totalQuantity += line.quantity
    totalSales += line.line_total

    const item = acc.items.get(line.product_id) ?? {
      name: menu.productName(line.product_id, line.product_name),
      quantity: 0,
      sales: 0,
      variants: new Map<string, VariantCount>(),
    }
    item.quantity += line.quantity
    item.sales += line.line_total
    acc.items.set(line.product_id, item)

    const variant = menu.variantOf(categoryId, modifiersByLine.get(line.id) ?? [])
    if (variant) {
      addVariant(acc.variants, variant, line.quantity, line.line_total)
      addVariant(item.variants, variant, line.quantity, line.line_total)
    }
  }

  const categories: CategorySummary[] = [...byCategory.entries()].map(([categoryId, acc]) => {
    const info = menu.category(categoryId)
    const items: ItemSummary[] = [...acc.items.entries()]
      .map(([productId, item]) => ({
        productId,
        name: item.name,
        quantity: item.quantity,
        sales: item.sales,
        shareOfCategory: acc.quantity ? (item.quantity / acc.quantity) * 100 : 0,
        variants: sortVariants(item.variants.values()),
      }))
      .sort((a, b) => b.quantity - a.quantity || b.sales - a.sales || a.name.localeCompare(b.name))
    const slowMovers = menu
      .activeProductsIn(categoryId)
      .map((p) => ({ productId: p.id, name: p.name, quantity: acc.items.get(p.id)?.quantity ?? 0 }))
      .filter((p) => p.quantity <= SLOW_MOVER_MAX_QTY)
      .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name))
    return {
      id: info.id,
      name: info.name,
      sortOrder: info.sortOrder,
      quantity: acc.quantity,
      sales: acc.sales,
      dimension: menu.dimensionOf(categoryId),
      variants: sortVariants(acc.variants.values()),
      items,
      slowMovers,
    }
  })
  // Menu order (the category sort set in the Menu editor); Uncategorized, if any, last.
  categories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  return { categories, totalQuantity, totalSales }
}

export interface ItemRow {
  item: string
  category: string
  /** Size/version, or null when the item's category has none. */
  variant: string | null
  quantity: number
  sales: number
  /** Share of total quantity across all categories, 0–100. */
  shareOfTotal: number
}

/** Flattens the analytics into one row per item × size/version, for the table and CSV. */
export function computeItemRows(analytics: ItemAnalytics): ItemRow[] {
  const share = (qty: number) => (analytics.totalQuantity ? (qty / analytics.totalQuantity) * 100 : 0)
  return analytics.categories.flatMap((category) =>
    category.items.flatMap((item): ItemRow[] =>
      item.variants.length > 0
        ? item.variants.map((v) => ({
            item: item.name,
            category: category.name,
            variant: v.name,
            quantity: v.quantity,
            sales: v.sales,
            shareOfTotal: share(v.quantity),
          }))
        : [{ item: item.name, category: category.name, variant: null, quantity: item.quantity, sales: item.sales, shareOfTotal: share(item.quantity) }],
    ),
  )
}

export interface OrderMetrics {
  orderCount: number
  /** Sum of order totals — the same figure as the existing Gross Sales. */
  grossSales: number
  avgOrderValue: number
  itemCount: number
  avgItemsPerOrder: number
}

export function computeOrderMetrics(orders: Order[], orderLines: OrderLine[]): OrderMetrics {
  const orderIds = new Set(orders.map((o) => o.id))
  const grossSales = orders.reduce((sum, o) => sum + o.total, 0)
  const itemCount = orderLines.reduce((sum, l) => (orderIds.has(l.order_id) ? sum + l.quantity : sum), 0)
  const orderCount = orders.length
  return {
    orderCount,
    grossSales,
    avgOrderValue: orderCount ? grossSales / orderCount : 0,
    itemCount,
    avgItemsPerOrder: orderCount ? itemCount / orderCount : 0,
  }
}

export interface HourActivity {
  hour: number
  label: string
  sales: number
  orders: number
}

function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}${hour < 12 ? 'a' : 'p'}`
}

/**
 * Sales and order count by hour of day across the whole range (e.g. a 7-day range adds
 * up every day's 6pm into one 6p bar), trimmed to the first..last hour with any orders so
 * the peak hours aren't squeezed between empty overnight bars. Empty array: no orders.
 */
export function computeHourlyActivity(orders: Order[]): HourActivity[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, label: hourLabel(hour), sales: 0, orders: 0 }))
  for (const o of orders) {
    const bucket = buckets[new Date(orderTimestamp(o)).getHours()]
    bucket.sales += o.total
    bucket.orders += 1
  }
  const active = buckets.filter((b) => b.orders > 0)
  if (active.length === 0) return []
  return buckets.slice(active[0].hour, active[active.length - 1].hour + 1)
}

/**
 * A real cancellation, as opposed to the Register quietly voiding an abandoned cart that
 * was never paid: voided after payment (Register void — completed_at was set at sale) or
 * cancelled from Order Management (kitchen_status 'cancelled'). There is no refund status.
 */
export function isCancelledOrder(order: Order): boolean {
  return order.status === 'voided' && (order.completed_at != null || order.kitchen_status === 'cancelled')
}

export function computeCancelled(orders: Order[]): { count: number; amount: number } {
  const cancelled = orders.filter(isCancelledOrder)
  return { count: cancelled.length, amount: cancelled.reduce((sum, o) => sum + o.total, 0) }
}

/** Orders (among `orders`) with at least one Senior/PWD discount claim. */
export function countSeniorPwdOrders(orders: Order[], orderDiscounts: OrderDiscount[]): number {
  const orderIds = new Set(orders.map((o) => o.id))
  return new Set(orderDiscounts.filter((d) => orderIds.has(d.order_id)).map((d) => d.order_id)).size
}

/** The equal-length period immediately before [start, end] — e.g. today → yesterday. */
export function previousPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const length = end.getTime() - start.getTime()
  return { start: new Date(start.getTime() - length - 1), end: new Date(start.getTime() - 1) }
}
