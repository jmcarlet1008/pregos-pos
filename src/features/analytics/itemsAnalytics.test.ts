import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
import {
  UNCATEGORIZED_ID,
  buildMenuIndex,
  computeCancelled,
  computeHourlyActivity,
  computeItemAnalytics,
  computeItemRows,
  computeOrderMetrics,
  countSeniorPwdOrders,
  isCancelledOrder,
  previousPeriod,
} from './itemsAnalytics.ts'

// ---------- fixtures ----------
// Names below are only test data — the module itself never looks at a name.

const base = { created_at: '2026-11-23T00:00:00.000Z', updated_at: '2026-11-23T00:00:00.000Z', sync_status: 'synced' as const }

function category(id: string, name: string, sort_order: number, extra: Partial<Category> = {}): Category {
  return { ...base, id, name, sort_order, active: true, deleted_at: null, ...extra }
}

function product(id: string, name: string, category_id: string, extra: Partial<Product> = {}): Product {
  return {
    ...base,
    id,
    name,
    category_id,
    price: 100,
    cost_price: null,
    description: '',
    image_url: null,
    active: true,
    sort_order: 0,
    track_inventory: false,
    stock_on_hand: 0,
    par_level: 0,
    reorder_point: 0,
    unit: 'pcs',
    deleted_at: null,
    ...extra,
  }
}

function group(id: string, product_id: string, name: string, max_picks = 1): ModifierGroup {
  return { ...base, id, product_id, name, required: max_picks === 1, min_picks: max_picks === 1 ? 1 : 0, max_picks, sort_order: 0, deleted_at: null }
}

function option(id: string, modifier_group_id: string, name: string): ModifierOption {
  return {
    ...base,
    id,
    modifier_group_id,
    name,
    price_adjustment: 0,
    cost_adjustment: null,
    deducts_stock: false,
    deduct_qty: 0,
    sort_order: 0,
    deleted_at: null,
  } as ModifierOption
}

function order(id: string, extra: Partial<Order> = {}): Order {
  return {
    ...base,
    id,
    order_number: 1,
    status: 'completed',
    total: 0,
    shift_id: null,
    user_id: null,
    completed_at: '2026-11-23T10:15:00.000Z',
    kitchen_status: 'served',
    channel: 'in_store',
    fulfillment_type: null,
    ...extra,
  } as Order
}

let lineSeq = 0
function line(order_id: string, product_id: string, quantity: number, line_total: number, product_name = product_id): OrderLine {
  lineSeq += 1
  return {
    ...base,
    id: `line-${lineSeq}`,
    order_id,
    product_id,
    product_name,
    quantity,
    unit_price: line_total / quantity,
    unit_cost: null,
    line_total,
    order_discount_id: null,
    remarks: null,
  }
}

function mod(order_line_id: string, modifier_option_id: string, name: string): OrderLineModifier {
  return { ...base, id: `mod-${order_line_id}-${modifier_option_id}`, order_line_id, modifier_option_id, name, price_adjustment: 0, unit_cost_adjustment: null }
}

const categories = [
  category('cat-pizza', 'Pizza', 0),
  category('cat-pasta', 'Pasta', 1),
  category('cat-chicken', 'Chicken', 2),
  category('cat-combo', 'Combo', 3),
  category('cat-drinks', 'Drinks', 4),
]
const products = [
  product('p-pepperoni', 'Pepperoni', 'cat-pizza'),
  product('p-hawaiian', 'Hawaiian', 'cat-pizza'),
  product('p-margherita', 'Margherita', 'cat-pizza'),
  product('p-carbonara', 'Carbonara', 'cat-pasta'),
  product('p-chicken', 'Fried Chicken', 'cat-chicken'),
  product('p-combo', 'Family Combo', 'cat-combo'),
  product('p-tea', 'Iced Tea', 'cat-drinks'),
  product('p-old', 'Discontinued Pizza', 'cat-pizza', { active: false, deleted_at: '2026-11-01T00:00:00.000Z' }),
]
const modifierGroups = [
  // Each pizza has its own "Size" group (groups are per product), plus a multi-pick add-on group.
  group('g-size-pep', 'p-pepperoni', 'Size'),
  group('g-size-haw', 'p-hawaiian', 'Size'),
  group('g-size-mar', 'p-margherita', ' size '), // spelling/case differences still match
  group('g-addons-pep', 'p-pepperoni', 'Add-ons', 3),
  group('g-version-carb', 'p-carbonara', 'Version'),
  // The combo's "choose your pizza" pick is a single-choice group ON the combo product.
  group('g-combo-pizza', 'p-combo', 'Pizza Choice'),
]
const modifierOptions = [
  option('o-pep-large', 'g-size-pep', 'Large'),
  option('o-pep-medium', 'g-size-pep', 'Medium'),
  option('o-haw-large', 'g-size-haw', 'Large'),
  option('o-haw-medium', 'g-size-haw', 'Medium'),
  option('o-mar-large', 'g-size-mar', 'Large'),
  option('o-pep-cheese', 'g-addons-pep', 'Extra Cheese'),
  option('o-carb-classic', 'g-version-carb', 'Classic'),
  option('o-carb-truffle', 'g-version-carb', 'Truffle'),
  option('o-combo-pep', 'g-combo-pizza', 'Pepperoni'),
]
const menu = buildMenuIndex({ categories, products, modifierGroups, modifierOptions })

function byName<T extends { name: string }>(list: T[], name: string): T {
  const found = list.find((x) => x.name === name)
  assert.ok(found, `expected an entry named ${name}`)
  return found
}

// ---------- tests ----------

describe('computeItemAnalytics', () => {
  const o1 = order('o1')
  const o2 = order('o2')
  const lines = [
    line('o1', 'p-pepperoni', 2, 800), // Large
    line('o1', 'p-pepperoni', 1, 350), // Medium
    line('o1', 'p-hawaiian', 3, 1200), // Large
    line('o2', 'p-hawaiian', 1, 350), // no size recorded
    line('o2', 'p-margherita', 1, 400), // Large via differently-spelled group
    line('o2', 'p-carbonara', 2, 500), // Classic
    line('o2', 'p-carbonara', 1, 300), // Truffle
    line('o2', 'p-chicken', 4, 1000),
    line('o2', 'p-combo', 1, 900), // combo with a pepperoni pick inside
    line('o2', 'p-tea', 2, 120),
  ]
  const mods = [
    mod(lines[0].id, 'o-pep-large', 'Large'),
    mod(lines[0].id, 'o-pep-cheese', 'Extra Cheese'),
    mod(lines[1].id, 'o-pep-medium', 'Medium'),
    mod(lines[2].id, 'o-haw-large', 'Large'),
    mod(lines[4].id, 'o-mar-large', 'Large'),
    mod(lines[5].id, 'o-carb-classic', 'Classic'),
    mod(lines[6].id, 'o-carb-truffle', 'Truffle'),
    mod(lines[8].id, 'o-combo-pep', 'Pepperoni'),
  ]
  const result = computeItemAnalytics([o1, o2], lines, mods, menu)
  const pizza = byName(result.categories, 'Pizza')

  it('sums line quantities (2× = 2), not lines or orders', () => {
    assert.equal(pizza.quantity, 2 + 1 + 3 + 1 + 1)
    assert.equal(result.totalQuantity, 2 + 1 + 3 + 1 + 1 + 2 + 1 + 4 + 1 + 2)
    assert.equal(result.totalSales, lines.reduce((s, l) => s + l.line_total, 0))
    assert.equal(byName(result.categories, 'Drinks').quantity, 2)
  })

  it('splits pizza by its size group and the parts add up to TOTAL PIZZA', () => {
    assert.equal(pizza.dimension, 'Size')
    assert.deepEqual(
      pizza.variants.map((v) => [v.name, v.quantity]),
      [
        ['Large', 6],
        ['Medium', 1],
        ['Size not recorded', 1],
      ],
    )
    assert.equal(pizza.variants.reduce((s, v) => s + v.quantity, 0), pizza.quantity)
    assert.equal(pizza.variants.reduce((s, v) => s + v.sales, 0), pizza.sales)
  })

  it('shows a line without a recorded size as "not recorded" instead of guessing', () => {
    const notRecorded = byName(pizza.variants, 'Size not recorded')
    assert.equal(notRecorded.notRecorded, true)
    // An add-on (multi-pick group) is not mistaken for a size.
    const pepperoni = byName(pizza.items, 'Pepperoni')
    assert.deepEqual(pepperoni.variants.map((v) => [v.name, v.quantity]), [['Large', 2], ['Medium', 1]])
  })

  it('treats a modifier whose option is missing from the menu as size not recorded', () => {
    const orphanLine = line('o3', 'p-pepperoni', 1, 400)
    const r = computeItemAnalytics([order('o3')], [orphanLine], [mod(orphanLine.id, 'o-gone', 'Large')], menu)
    assert.deepEqual(byName(r.categories, 'Pizza').variants.map((v) => v.name), ['Size not recorded'])
  })

  it('uses each category’s own variant group (pasta versions)', () => {
    const pasta = byName(result.categories, 'Pasta')
    assert.equal(pasta.dimension, 'Version')
    assert.deepEqual(pasta.variants.map((v) => [v.name, v.quantity]), [['Classic', 2], ['Truffle', 1]])
  })

  it('skips the variant block for a category with no single-choice group', () => {
    const chicken = byName(result.categories, 'Chicken')
    assert.equal(chicken.dimension, null)
    assert.deepEqual(chicken.variants, [])
  })

  it('counts a combo under Combo only — its pizza pick is not added to Pizza', () => {
    assert.equal(byName(result.categories, 'Combo').quantity, 1)
    assert.equal(byName(pizza.items, 'Pepperoni').quantity, 3) // only the two real pepperoni lines
    assert.equal(byName(result.categories, 'Chicken').quantity, 4)
  })

  it('ranks top flavors by quantity, then sales, with % of category', () => {
    assert.deepEqual(pizza.items.map((i) => i.name), ['Hawaiian', 'Pepperoni', 'Margherita'])
    const hawaiian = pizza.items[0]
    assert.equal(hawaiian.quantity, 4)
    assert.equal(hawaiian.sales, 1550)
    assert.equal(hawaiian.shareOfCategory, (4 / 8) * 100)
    assert.equal(pizza.items.reduce((s, i) => s + i.shareOfCategory, 0), 100)
  })

  it('lists active items that sold 0–1 as slow movers, never deleted ones', () => {
    assert.deepEqual(pizza.slowMovers.map((s) => [s.name, s.quantity]), [['Margherita', 1]])
    assert.ok(!pizza.slowMovers.some((s) => s.productId === 'p-old'))
  })

  it('keeps menu category order and shows active categories even with no sales', () => {
    const r = computeItemAnalytics([], [], [], menu)
    assert.deepEqual(r.categories.map((c) => [c.name, c.quantity]), [
      ['Pizza', 0],
      ['Pasta', 0],
      ['Chicken', 0],
      ['Combo', 0],
      ['Drinks', 0],
    ])
    assert.equal(byName(r.categories, 'Pizza').slowMovers.length, 3)
  })
})

describe('excluded and unknown data', () => {
  it('ignores lines of orders not passed in (e.g. cancelled/voided ones)', () => {
    const kept = line('ok', 'p-tea', 1, 60)
    const cancelled = line('cancelled', 'p-tea', 5, 300)
    const r = computeItemAnalytics([order('ok')], [kept, cancelled], [], menu)
    assert.equal(r.totalQuantity, 1)
    assert.equal(byName(r.categories, 'Drinks').sales, 60)
  })

  it('still counts a sold item that was later removed from the menu, under its category', () => {
    const r = computeItemAnalytics([order('o')], [line('o', 'p-old', 2, 700)], [], menu)
    assert.equal(byName(r.categories, 'Pizza').quantity, 2)
  })

  it('puts a line whose product no longer exists in Uncategorized, last', () => {
    const r = computeItemAnalytics([order('o')], [line('o', 'p-missing', 1, 99, 'Mystery Item')], [], menu)
    const last = r.categories[r.categories.length - 1]
    assert.equal(last.id, UNCATEGORIZED_ID)
    assert.equal(last.items[0].name, 'Mystery Item')
    assert.equal(r.totalQuantity, 1)
  })
})

describe('computeItemRows', () => {
  it('one row per item × size, quantities summing to the total', () => {
    const l1 = line('o', 'p-pepperoni', 2, 800)
    const l2 = line('o', 'p-pepperoni', 1, 350)
    const l3 = line('o', 'p-chicken', 1, 250)
    const r = computeItemAnalytics([order('o')], [l1, l2, l3], [mod(l1.id, 'o-pep-large', 'Large'), mod(l2.id, 'o-pep-medium', 'Medium')], menu)
    const rows = computeItemRows(r)
    assert.deepEqual(
      rows.map((x) => [x.item, x.variant, x.quantity]),
      [
        ['Pepperoni', 'Large', 2],
        ['Pepperoni', 'Medium', 1],
        ['Fried Chicken', null, 1],
      ],
    )
    assert.equal(rows.reduce((s, x) => s + x.quantity, 0), r.totalQuantity)
    assert.equal(Math.round(rows.reduce((s, x) => s + x.shareOfTotal, 0)), 100)
  })
})

describe('order-level metrics', () => {
  it('counts orders, average order value and items per order', () => {
    const orders = [order('a', { total: 300 }), order('b', { total: 500 })]
    const lines = [line('a', 'p-tea', 2, 120), line('b', 'p-chicken', 3, 750), line('other', 'p-tea', 9, 540)]
    const m = computeOrderMetrics(orders, lines)
    assert.deepEqual(m, { orderCount: 2, grossSales: 800, avgOrderValue: 400, itemCount: 5, avgItemsPerOrder: 2.5 })
    assert.deepEqual(computeOrderMetrics([], []), { orderCount: 0, grossSales: 0, avgOrderValue: 0, itemCount: 0, avgItemsPerOrder: 0 })
  })

  it('groups sales/orders by hour and trims empty hours at the edges', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 23, h, m).toISOString()
    const hours = computeHourlyActivity([
      order('a', { total: 100, completed_at: at(11, 5) }),
      order('b', { total: 200, completed_at: at(11, 50) }),
      order('c', { total: 50, completed_at: at(13) }),
    ])
    assert.deepEqual(hours.map((h) => [h.label, h.orders, h.sales]), [
      ['11a', 2, 300],
      ['12p', 0, 0],
      ['1p', 1, 50],
    ])
    assert.deepEqual(computeHourlyActivity([]), [])
  })

  it('counts a real cancellation but not an abandoned, never-paid Register cart', () => {
    const voidedAfterSale = order('v1', { status: 'voided', total: 400 })
    const cancelledFromOrderManagement = order('v2', { status: 'voided', completed_at: null, kitchen_status: 'cancelled', total: 650 })
    const abandonedCart = order('v3', { status: 'voided', completed_at: null, kitchen_status: 'new', total: 0 })
    assert.equal(isCancelledOrder(abandonedCart), false)
    assert.equal(isCancelledOrder(order('done')), false)
    assert.deepEqual(computeCancelled([voidedAfterSale, cancelledFromOrderManagement, abandonedCart, order('done')]), {
      count: 2,
      amount: 1050,
    })
  })

  it('counts each Senior/PWD order once, even with two claims', () => {
    const claim = (order_id: string, n: number): OrderDiscount => ({
      ...base,
      id: `d-${order_id}-${n}`,
      order_id,
      discount_type: 'senior',
      holder_name: 'x',
      id_number: 'x',
    })
    assert.equal(countSeniorPwdOrders([order('a'), order('b')], [claim('a', 1), claim('a', 2), claim('zz', 1)]), 1)
  })

  it('previous equal period: today → yesterday', () => {
    const start = new Date(2026, 10, 23, 0, 0, 0, 0)
    const end = new Date(2026, 10, 23, 23, 59, 59, 999)
    const prev = previousPeriod(start, end)
    assert.equal(prev.start.getTime(), new Date(2026, 10, 22, 0, 0, 0, 0).getTime())
    assert.equal(prev.end.getTime(), new Date(2026, 10, 22, 23, 59, 59, 999).getTime())
  })
})
