import type {
  DiscountType,
  Order,
  OrderChannel,
  OrderDiscount,
  OrderLine,
  OrderLineModifier,
  Payment,
  PaymentMethod,
  User,
} from '../../db'
import { csvCell, downloadCsv } from '../../lib/csv'
import {
  addDays,
  endOfDay,
  filterOrdersInRange,
  fromDateInputValue,
  orderTimestamp,
  startOfDay,
  toDateInputValue,
} from '../../lib/dateRange'
import { netOfVat, seniorPwdDiscountAmount, seniorPwdDiscountedPrice } from '../../lib/discount'
import { CHANNEL_LABEL, FULFILLMENT_LABEL, getFulfillmentKind, type FulfillmentKind } from '../../lib/orderWorkflow'

// Date-range and CSV helpers below live in src/lib (dateRange.ts/csv.ts) so other
// features — e.g. register/orderHistoryData.ts — can reuse them without a cross-feature
// import; re-exported here unchanged so existing imports from this module keep working.
export { addDays, downloadCsv, endOfDay, filterOrdersInRange, fromDateInputValue, orderTimestamp, startOfDay, toDateInputValue }

export interface RangeStats {
  grossSales: number
  orderCount: number
  avgTicket: number
}

export function computeStats(orders: Order[]): RangeStats {
  const grossSales = orders.reduce((sum, o) => sum + o.total, 0)
  const orderCount = orders.length
  return { grossSales, orderCount, avgTicket: orderCount ? grossSales / orderCount : 0 }
}

/** Percent change of current vs previous. Null means "no baseline" (previous was zero) — render as n/a, not ±∞ or 0%. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export interface KpiData {
  today: RangeStats
  yesterday: RangeStats
}

export function computeKpiData(orders: Order[], now: Date): KpiData {
  return {
    today: computeStats(filterOrdersInRange(orders, startOfDay(now), endOfDay(now))),
    yesterday: computeStats(filterOrdersInRange(orders, startOfDay(addDays(now, -1)), endOfDay(addDays(now, -1)))),
  }
}

export type ChartMode = 'today' | 'week'

export interface ChartBucket {
  label: string
  sales: number
}

function formatHourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour < 12 ? 'a' : 'p'
  return `${h}${suffix}`
}

export function computeHourlyBuckets(orders: Order[], day: Date): ChartBucket[] {
  const todays = filterOrdersInRange(orders, startOfDay(day), endOfDay(day))
  const buckets = Array.from({ length: 24 }, () => 0)
  for (const o of todays) {
    const hour = new Date(orderTimestamp(o)).getHours()
    buckets[hour] += o.total
  }
  return buckets.map((sales, hour) => ({ label: formatHourLabel(hour), sales }))
}

export function computeWeeklyBuckets(orders: Order[], now: Date): ChartBucket[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(now, i - 6)
    const dayOrders = filterOrdersInRange(orders, startOfDay(day), endOfDay(day))
    return { label: day.toLocaleDateString('en-PH', { weekday: 'short' }), sales: computeStats(dayOrders).grossSales }
  })
}

export interface TopItem {
  name: string
  quantity: number
  revenue: number
}

export function computeTopItems(orderIds: Set<string>, orderLines: OrderLine[], limit = 8): TopItem[] {
  const byName = new Map<string, TopItem>()
  for (const line of orderLines) {
    if (!orderIds.has(line.order_id)) continue
    const existing = byName.get(line.product_name) ?? { name: line.product_name, quantity: 0, revenue: 0 }
    existing.quantity += line.quantity
    existing.revenue += line.line_total
    byName.set(line.product_name, existing)
  }
  return [...byName.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

// ---------- Profit reporting ----------
//
// A line's cost is the sum of the base product's cost plus each attached modifier's own
// cost (e.g. a "Large" upgrade might cost more dough/cheese than its price_adjustment
// alone reveals) — see computeLineCostComponents. Each component resolves independently
// (exact snapshot → current-value estimate → unknown) via resolveLineCost/
// resolveModifierCost, and a line's total cost is whatever's actually known, summed
// together — never fabricated to 0 for a component that's still unset. hasUnknown/
// hasEstimated flag when any component was missing/estimated, so a line can show a
// meaningful *partial* cost/profit instead of being excluded outright.
//
// Known simplification: computeItemProfit/computeTopItems group sales by product_name
// only, so e.g. "Margherita Pizza (Medium)" and "(Large)" roll into one row — a
// pre-existing convention, not something this feature changes.
//
// Note: like computeTopItems above, these functions sum line.line_total (pre-discount)
// as "Sales," matching computeTopItems' existing convention rather than the
// post-Senior/PWD-discount order.total used by computeStats' Gross Sales KPI. This means
// the Profit tab's Sales figure won't perfectly reconcile with the Overview tab's Gross
// Sales KPI on ranges containing discounts — the same pre-existing gap Top Items has.

export interface LineCostResolution {
  cost: number | null
  estimated: boolean
}

/**
 * Resolves the per-unit cost for a sold line: prefers the exact snapshot captured at
 * time of sale (line.unit_cost), falling back to the product's *current* cost_price for
 * lines sold before cost tracking existed (flagged as `estimated`, since the true cost
 * at the time of that sale may have differed — see plan.md decision on historical
 * back-fill). Null means genuinely unknown — never fabricated as 0.
 */
export function resolveLineCost(
  line: OrderLine,
  productCostById: Map<string, number | null>,
): LineCostResolution {
  if (line.unit_cost != null) return { cost: line.unit_cost, estimated: false }
  const current = productCostById.get(line.product_id) ?? null
  if (current != null) return { cost: current, estimated: true }
  return { cost: null, estimated: false }
}

/**
 * Resolves the per-unit cost impact of one selected modifier (e.g. a "Large" size
 * upgrade) — identical shape to resolveLineCost, just keyed by modifier_option_id
 * instead of product_id.
 */
export function resolveModifierCost(
  mod: OrderLineModifier,
  modifierOptionCostById: Map<string, number | null>,
): LineCostResolution {
  if (mod.unit_cost_adjustment != null) return { cost: mod.unit_cost_adjustment, estimated: false }
  const current = modifierOptionCostById.get(mod.modifier_option_id) ?? null
  if (current != null) return { cost: current, estimated: true }
  return { cost: null, estimated: false }
}

/**
 * Total cost for one order line: base product cost plus each attached modifier's cost,
 * per-unit, times quantity — mirrors lineTotal's (unit_price + Σ price_adjustment) ×
 * quantity shape, but for cost. Sums whatever components ARE known rather than
 * all-or-nothing: a line with a known product cost but an unpriced modifier still
 * contributes its known (partial) cost, flagged via hasUnknown rather than excluded.
 */
function computeLineCostComponents(
  line: OrderLine,
  lineModifiers: OrderLineModifier[],
  productCostById: Map<string, number | null>,
  modifierOptionCostById: Map<string, number | null>,
): { cost: number; hasUnknown: boolean; hasEstimated: boolean } {
  let unitCost = 0
  let hasUnknown = false
  let hasEstimated = false

  const productResolved = resolveLineCost(line, productCostById)
  if (productResolved.cost != null) {
    unitCost += productResolved.cost
    if (productResolved.estimated) hasEstimated = true
  } else {
    hasUnknown = true
  }

  for (const mod of lineModifiers) {
    const modResolved = resolveModifierCost(mod, modifierOptionCostById)
    if (modResolved.cost != null) {
      unitCost += modResolved.cost
      if (modResolved.estimated) hasEstimated = true
    } else {
      hasUnknown = true
    }
  }

  return { cost: unitCost * line.quantity, hasUnknown, hasEstimated }
}

/** Groups OrderLineModifiers by order_line_id — shared by every function below that needs per-line modifier cost. */
function groupModifiersByLineId(orderLineModifiers: OrderLineModifier[]): Map<string, OrderLineModifier[]> {
  const byLineId = new Map<string, OrderLineModifier[]>()
  for (const mod of orderLineModifiers) {
    const existing = byLineId.get(mod.order_line_id)
    if (existing) existing.push(mod)
    else byLineId.set(mod.order_line_id, [mod])
  }
  return byLineId
}

export interface ProfitFigures {
  sales: number
  cost: number
  profit: number
  hasEstimated: boolean
  hasUnknown: boolean
}

/**
 * Sales/cost/profit for orderLines scoped to orderIds — same filter shape as
 * computeTopItems. Each line's cost is whatever components (product + modifiers) are
 * actually known, summed (see computeLineCostComponents); hasUnknown flags that the
 * cost/profit figures are partial so the UI can say so explicitly, and hasEstimated
 * flags that at least one component used a present-day cost fallback rather than an
 * exact historical snapshot.
 */
export function computeProfitForLines(
  orderLines: OrderLine[],
  orderLineModifiers: OrderLineModifier[],
  orderIds: Set<string>,
  productCostById: Map<string, number | null>,
  modifierOptionCostById: Map<string, number | null>,
): ProfitFigures {
  const modifiersByLineId = groupModifiersByLineId(orderLineModifiers)
  let sales = 0
  let cost = 0
  let hasEstimated = false
  let hasUnknown = false
  for (const line of orderLines) {
    if (!orderIds.has(line.order_id)) continue
    sales += line.line_total
    const lineModifiers = modifiersByLineId.get(line.id) ?? []
    const components = computeLineCostComponents(line, lineModifiers, productCostById, modifierOptionCostById)
    cost += components.cost
    if (components.hasUnknown) hasUnknown = true
    if (components.hasEstimated) hasEstimated = true
  }
  return { sales, cost, profit: sales - cost, hasEstimated, hasUnknown }
}

/** Whole-range profit summary for the Profit tab's headline Sales/Cost/Profit cards. */
export function computeProfitSummary(
  filteredOrders: Order[],
  orderLines: OrderLine[],
  orderLineModifiers: OrderLineModifier[],
  productCostById: Map<string, number | null>,
  modifierOptionCostById: Map<string, number | null>,
): ProfitFigures {
  const orderIds = new Set(filteredOrders.map((o) => o.id))
  return computeProfitForLines(orderLines, orderLineModifiers, orderIds, productCostById, modifierOptionCostById)
}

export interface DailyProfitPoint extends ProfitFigures {
  date: string
  label: string
}

/** One profit figure per calendar day from start to end (inclusive), for the day-comparison chart. */
export function computeDailyProfit(
  orders: Order[],
  orderLines: OrderLine[],
  orderLineModifiers: OrderLineModifier[],
  productCostById: Map<string, number | null>,
  modifierOptionCostById: Map<string, number | null>,
  start: Date,
  end: Date,
): DailyProfitPoint[] {
  const points: DailyProfitPoint[] = []
  const endMs = endOfDay(end).getTime()
  let day = startOfDay(start)
  while (day.getTime() <= endMs) {
    const dayOrders = filterOrdersInRange(orders, startOfDay(day), endOfDay(day))
    const dayOrderIds = new Set(dayOrders.map((o) => o.id))
    const figures = computeProfitForLines(
      orderLines,
      orderLineModifiers,
      dayOrderIds,
      productCostById,
      modifierOptionCostById,
    )
    points.push({
      ...figures,
      date: toDateInputValue(day),
      label: day.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    })
    day = addDays(day, 1)
  }
  return points
}

export interface ItemProfit {
  name: string
  quantity: number
  sales: number
  cost: number
  profit: number
  hasEstimated: boolean
  hasUnknown: boolean
}

/**
 * Per-item profit ranking, same group-by-product_name shape as computeTopItems, but
 * sorted by profit (not revenue) descending — the point of this view is which items
 * actually make money, not just which sell the most.
 */
export function computeItemProfit(
  orderIds: Set<string>,
  orderLines: OrderLine[],
  orderLineModifiers: OrderLineModifier[],
  productCostById: Map<string, number | null>,
  modifierOptionCostById: Map<string, number | null>,
  limit = 8,
): ItemProfit[] {
  const modifiersByLineId = groupModifiersByLineId(orderLineModifiers)
  const byName = new Map<string, ItemProfit>()
  for (const line of orderLines) {
    if (!orderIds.has(line.order_id)) continue
    const existing = byName.get(line.product_name) ?? {
      name: line.product_name,
      quantity: 0,
      sales: 0,
      cost: 0,
      profit: 0,
      hasEstimated: false,
      hasUnknown: false,
    }
    existing.quantity += line.quantity
    existing.sales += line.line_total
    const lineModifiers = modifiersByLineId.get(line.id) ?? []
    const components = computeLineCostComponents(line, lineModifiers, productCostById, modifierOptionCostById)
    existing.cost += components.cost
    if (components.hasUnknown) existing.hasUnknown = true
    if (components.hasEstimated) existing.hasEstimated = true
    existing.profit = existing.sales - existing.cost
    byName.set(line.product_name, existing)
  }
  // An item with zero known-cost lines computes profit === sales (cost stayed at 0),
  // which would otherwise look like the best margin in the list — the opposite of
  // "never fabricate cost as 0." Sink those unrankable items to the bottom instead of
  // sorting them by that misleading number; rankable items sort by profit as normal.
  return [...byName.values()]
    .sort((a, b) => {
      const aRankable = !(a.hasUnknown && a.cost === 0)
      const bRankable = !(b.hasUnknown && b.cost === 0)
      if (aRankable !== bRankable) return aRankable ? -1 : 1
      return b.profit - a.profit
    })
    .slice(0, limit)
}

export interface PaymentSplit {
  cash: { amount: number; count: number }
  gcash: { amount: number; count: number }
}

export function computePaymentSplit(orders: Order[], payments: Payment[]): PaymentSplit {
  const paymentByOrder = new Map(payments.map((p) => [p.order_id, p]))
  const split: PaymentSplit = { cash: { amount: 0, count: 0 }, gcash: { amount: 0, count: 0 } }
  for (const o of orders) {
    const payment = paymentByOrder.get(o.id)
    if (!payment) continue
    split[payment.method].amount += o.total
    split[payment.method].count += 1
  }
  return split
}

export type ChannelFilter = 'all' | OrderChannel
export type FulfillmentFilter = 'all' | FulfillmentKind

/** Narrows orders by channel and/or fulfillment kind — 'all' on either axis is a no-op
 *  for that axis; the two are independently AND-combinable (e.g. Online + Delivery). */
export function filterByChannelAndFulfillment(
  orders: Order[],
  channelFilter: ChannelFilter,
  fulfillmentFilter: FulfillmentFilter,
): Order[] {
  return orders.filter((o) => {
    if (channelFilter !== 'all' && o.channel !== channelFilter) return false
    if (fulfillmentFilter !== 'all' && getFulfillmentKind(o) !== fulfillmentFilter) return false
    return true
  })
}

export interface ChannelSplit {
  in_store: { amount: number; count: number }
  online: { amount: number; count: number }
  phone: { amount: number; count: number }
}

export interface FulfillmentSplit {
  'walk-in': { amount: number; count: number }
  pickup: { amount: number; count: number }
  delivery: { amount: number; count: number }
}

export interface ChannelFulfillmentBreakdown {
  channel: ChannelSplit
  fulfillment: FulfillmentSplit
}

/** Channel/fulfillment breakdown of the given orders — same accumulate-per-bucket shape
 *  as computePaymentSplit above. Combined total isn't duplicated here: callers reuse the
 *  already-existing computeStats(orders) on the same order set for that. */
export function computeChannelFulfillmentBreakdown(orders: Order[]): ChannelFulfillmentBreakdown {
  const breakdown: ChannelFulfillmentBreakdown = {
    channel: { in_store: { amount: 0, count: 0 }, online: { amount: 0, count: 0 }, phone: { amount: 0, count: 0 } },
    fulfillment: {
      'walk-in': { amount: 0, count: 0 },
      pickup: { amount: 0, count: 0 },
      delivery: { amount: 0, count: 0 },
    },
  }
  for (const o of orders) {
    breakdown.channel[o.channel].amount += o.total
    breakdown.channel[o.channel].count += 1
    const kind = getFulfillmentKind(o)
    breakdown.fulfillment[kind].amount += o.total
    breakdown.fulfillment[kind].count += 1
  }
  return breakdown
}

/** Reporting-only estimate of the VAT already baked into VAT-inclusive prices — never shown at checkout, see plan.md. */
export function vatPortion(total: number): number {
  return (total * 12) / 112
}

export interface DiscountTypeBirFigures {
  vatExemptSales: number
  discountGranted: number
}

export interface BirBreakdown {
  vatableSales: number
  outputVatDue: number
  vatExemptSales: number
  discountGranted: number
  senior: DiscountTypeBirFigures
  pwd: DiscountTypeBirFigures
}

/**
 * Buckets line totals into VATable (untagged) vs Senior/PWD-tagged gross, then applies the
 * BIR-oriented formulas: VATable Sales stays net-of-assumed-VAT (matching vatPortion()'s
 * existing convention), while the Senior/PWD side is computed straight off the full price —
 * this business applies a flat 20% discount with no VAT-removal step (see lib/discount.ts).
 */
export function computeLinesBirFigures(
  lines: OrderLine[],
  discountTypeById: Map<string, DiscountType>,
): BirBreakdown {
  let vatableGross = 0
  let seniorGross = 0
  let pwdGross = 0

  for (const line of lines) {
    if (line.order_discount_id) {
      const type = discountTypeById.get(line.order_discount_id)
      if (type === 'senior') seniorGross += line.line_total
      else if (type === 'pwd') pwdGross += line.line_total
    } else {
      vatableGross += line.line_total
    }
  }

  const vatableSales = netOfVat(vatableGross)
  const senior: DiscountTypeBirFigures = {
    vatExemptSales: seniorPwdDiscountedPrice(seniorGross),
    discountGranted: seniorPwdDiscountAmount(seniorGross),
  }
  const pwd: DiscountTypeBirFigures = {
    vatExemptSales: seniorPwdDiscountedPrice(pwdGross),
    discountGranted: seniorPwdDiscountAmount(pwdGross),
  }

  return {
    vatableSales,
    outputVatDue: vatableSales * 0.12,
    vatExemptSales: senior.vatExemptSales + pwd.vatExemptSales,
    discountGranted: senior.discountGranted + pwd.discountGranted,
    senior,
    pwd,
  }
}

/** Same breakdown as computeLinesBirFigures, scoped to the given orders' own lines. */
export function computeBirBreakdown(
  orders: Order[],
  orderLines: OrderLine[],
  orderDiscounts: OrderDiscount[],
): BirBreakdown {
  const orderIds = new Set(orders.map((o) => o.id))
  const discountTypeById = new Map(orderDiscounts.map((d) => [d.id, d.discount_type]))
  const relevantLines = orderLines.filter((line) => orderIds.has(line.order_id))
  return computeLinesBirFigures(relevantLines, discountTypeById)
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', gcash: 'GCash' }

export function buildOrdersCsv(
  orders: Order[],
  payments: Payment[],
  users: User[],
  orderLines: OrderLine[],
  orderDiscounts: OrderDiscount[],
): string {
  const paymentByOrder = new Map(payments.map((p) => [p.order_id, p]))
  const userById = new Map(users.map((u) => [u.id, u]))
  const discountTypeById = new Map(orderDiscounts.map((d) => [d.id, d.discount_type]))
  const linesByOrder = new Map<string, OrderLine[]>()
  for (const line of orderLines) {
    const existing = linesByOrder.get(line.order_id)
    if (existing) existing.push(line)
    else linesByOrder.set(line.order_id, [line])
  }

  const header = [
    'Order #',
    'Date',
    'Time',
    'Cashier',
    'Channel',
    'Fulfillment',
    'Payment Method',
    'Total',
    'VAT Portion (ref. only)',
    'VATable Sales (net)',
    'VAT-Exempt Sales (net)',
    'Output VAT Due',
    'SC/PWD Discount Granted',
    'Senior Discount Granted',
    'PWD Discount Granted',
  ]

  const rows = orders
    .slice()
    .sort((a, b) => orderTimestamp(a).localeCompare(orderTimestamp(b)))
    .map((o) => {
      const ts = new Date(orderTimestamp(o))
      const payment = paymentByOrder.get(o.id)
      const cashier = o.user_id ? userById.get(o.user_id) : undefined
      const bir = computeLinesBirFigures(linesByOrder.get(o.id) ?? [], discountTypeById)
      return [
        String(o.order_number ?? '—'),
        ts.toLocaleDateString('en-PH'),
        ts.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
        cashier?.name ?? '—',
        CHANNEL_LABEL[o.channel],
        FULFILLMENT_LABEL[getFulfillmentKind(o)],
        payment ? PAYMENT_LABEL[payment.method] : '—',
        o.total.toFixed(2),
        vatPortion(o.total).toFixed(2),
        bir.vatableSales.toFixed(2),
        bir.vatExemptSales.toFixed(2),
        bir.outputVatDue.toFixed(2),
        bir.discountGranted.toFixed(2),
        bir.senior.discountGranted.toFixed(2),
        bir.pwd.discountGranted.toFixed(2),
      ]
    })

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

/**
 * Detailed export: one row per (order, orderLine), with cost/sales/profit — additive to
 * buildOrdersCsv above, which stays exactly as-is for whatever bookkeeping/BIR workflow
 * already depends on its per-order shape.
 *
 * Cost Source is exact (product + all attached modifiers had real snapshots) / estimated
 * (all known, at least one used the current-value fallback) / partial (at least one
 * component — product or a modifier — is still unknown; Unit/Line Cost and Line Profit
 * reflect only the known components). Cells are left BLANK (not the text "N/A") only
 * when *nothing* is known at all, so the numeric columns stay summable in Excel/Sheets —
 * Cost Source already says why a row is blank or partial.
 */
export function buildDetailedSalesCsv(
  orders: Order[],
  orderLines: OrderLine[],
  orderLineModifiers: OrderLineModifier[],
  productCostById: Map<string, number | null>,
  modifierOptionCostById: Map<string, number | null>,
  users: User[],
): string {
  const orderById = new Map(orders.map((o) => [o.id, o]))
  const userById = new Map(users.map((u) => [u.id, u]))
  const modifiersByLineId = groupModifiersByLineId(orderLineModifiers)

  const header = [
    'Order #',
    'Date',
    'Time',
    'Cashier',
    'Channel',
    'Fulfillment',
    'Product',
    'Modifiers',
    'Qty',
    'Unit Sale Price',
    'Unit Cost',
    'Cost Source',
    'Line Sales',
    'Line Cost',
    'Line Profit',
  ]

  const relevantLines = orderLines
    .filter((line) => orderById.has(line.order_id))
    .slice()
    .sort((a, b) => {
      const tsCompare = orderTimestamp(orderById.get(a.order_id)!).localeCompare(
        orderTimestamp(orderById.get(b.order_id)!),
      )
      return tsCompare !== 0 ? tsCompare : a.created_at.localeCompare(b.created_at)
    })

  const rows = relevantLines.map((line) => {
    const order = orderById.get(line.order_id)!
    const ts = new Date(orderTimestamp(order))
    const cashier = order.user_id ? userById.get(order.user_id) : undefined
    const lineModifiers = modifiersByLineId.get(line.id) ?? []
    const components = computeLineCostComponents(line, lineModifiers, productCostById, modifierOptionCostById)
    const costSource = components.hasUnknown ? 'partial' : components.hasEstimated ? 'estimated' : 'exact'
    const nothingKnown = components.hasUnknown && components.cost === 0
    const unitCost = line.quantity > 0 ? components.cost / line.quantity : 0
    const lineProfit = line.line_total - components.cost
    return [
      String(order.order_number ?? '—'),
      ts.toLocaleDateString('en-PH'),
      ts.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
      cashier?.name ?? '—',
      CHANNEL_LABEL[order.channel],
      FULFILLMENT_LABEL[getFulfillmentKind(order)],
      line.product_name,
      lineModifiers.map((m) => m.name).join('; '),
      String(line.quantity),
      line.unit_price.toFixed(2),
      nothingKnown ? '' : unitCost.toFixed(2),
      costSource,
      line.line_total.toFixed(2),
      nothingKnown ? '' : components.cost.toFixed(2),
      nothingKnown ? '' : lineProfit.toFixed(2),
    ]
  })

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}
