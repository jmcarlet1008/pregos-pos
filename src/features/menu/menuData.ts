import {
  db,
  timestamps,
  touch,
  type Category,
  type ModifierGroup,
  type ModifierOption,
  type Product,
} from '../../db'

function id() {
  return crypto.randomUUID()
}

function notDeleted<T extends { deleted_at: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted_at)
}

async function nextSortOrder<T extends { sort_order: number; deleted_at: string | null }>(
  all: () => Promise<T[]>,
): Promise<number> {
  const rows = notDeleted(await all())
  return rows.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1
}

// ---------- Categories ----------

export interface CategoryInput {
  name: string
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const sort_order = await nextSortOrder(() => db.categories.toArray())
  const category: Category = {
    id: id(),
    name: input.name.trim(),
    sort_order,
    active: true,
    deleted_at: null,
    sync_status: 'pending',
    ...timestamps(),
  }
  await db.categories.add(category)
  return category.id
}

export async function renameCategory(categoryId: string, name: string): Promise<void> {
  const category = await db.categories.get(categoryId)
  if (!category) return
  await db.categories.put(touch({ ...category, name: name.trim() }))
}

export async function setCategoryActive(categoryId: string, active: boolean): Promise<void> {
  const category = await db.categories.get(categoryId)
  if (!category) return
  await db.categories.put(touch({ ...category, active }))
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', [db.categories], async () => {
    await Promise.all(
      orderedIds.map(async (categoryId, index) => {
        const category = await db.categories.get(categoryId)
        if (!category || category.sort_order === index) return
        await db.categories.put(touch({ ...category, sort_order: index }))
      }),
    )
  })
}

/**
 * Soft-deletes a category (throws if it still has non-deleted products assigned).
 * See SoftDeletable in db/schema.ts for why this isn't a plain Dexie `.delete()`.
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  const products = notDeleted(await db.products.where('category_id').equals(categoryId).toArray())
  if (products.length > 0) {
    throw new Error('Move or delete this category’s products before deleting it.')
  }
  const category = await db.categories.get(categoryId)
  if (!category) return
  await db.categories.put(touch({ ...category, deleted_at: new Date().toISOString() }))
}

// ---------- Products ----------

export interface ProductInput {
  name: string
  category_id: string
  price: number
  cost_price: number | null
  description: string
  image_url: string | null
  active: boolean
  track_inventory: boolean
  stock_on_hand: number
  par_level: number
  reorder_point: number
  unit: string
}

export async function createProduct(input: ProductInput): Promise<string> {
  const sort_order = await nextSortOrder(() => db.products.toArray())
  const product: Product = {
    id: id(),
    ...input,
    sort_order,
    deleted_at: null,
    sync_status: 'pending',
    ...timestamps(),
  }
  await db.products.add(product)
  return product.id
}

export async function updateProduct(productId: string, input: ProductInput): Promise<void> {
  const product = await db.products.get(productId)
  if (!product) return
  await db.products.put(touch({ ...product, ...input }))
}

export async function setProductActive(productId: string, active: boolean): Promise<void> {
  const product = await db.products.get(productId)
  if (!product) return
  await db.products.put(touch({ ...product, active }))
}

/**
 * Reassigns sort_order among a visible (possibly filtered) subset of products, reusing that
 * subset's own sort_order values as slots so other categories' relative ordering is untouched —
 * sort_order is a single global sequence, not scoped per category.
 */
export async function reorderProducts(visibleSortedAsc: Product[], orderedIds: string[]): Promise<void> {
  const slots = visibleSortedAsc.map((p) => p.sort_order).sort((a, b) => a - b)
  await db.transaction('rw', [db.products], async () => {
    await Promise.all(
      orderedIds.map(async (productId, index) => {
        const product = await db.products.get(productId)
        if (!product || product.sort_order === slots[index]) return
        await db.products.put(touch({ ...product, sort_order: slots[index] }))
      }),
    )
  })
}

/** Soft-deletes a product along with its (non-deleted) modifier groups/options. */
export async function deleteProduct(productId: string): Promise<void> {
  await db.transaction('rw', [db.products, db.modifierGroups, db.modifierOptions], async () => {
    const deleted_at = new Date().toISOString()
    const groups = notDeleted(await db.modifierGroups.where('product_id').equals(productId).toArray())
    for (const group of groups) {
      const options = notDeleted(await db.modifierOptions.where('modifier_group_id').equals(group.id).toArray())
      for (const option of options) {
        await db.modifierOptions.put(touch({ ...option, deleted_at }))
      }
      await db.modifierGroups.put(touch({ ...group, deleted_at }))
    }
    const product = await db.products.get(productId)
    if (!product) return
    await db.products.put(touch({ ...product, deleted_at }))
  })
}

// ---------- Modifier Groups ----------

export interface ModifierGroupInput {
  name: string
  required: boolean
  min_picks: number
  max_picks: number
}

export async function createModifierGroup(productId: string, input: ModifierGroupInput): Promise<string> {
  const sort_order = await nextSortOrder(() => db.modifierGroups.where('product_id').equals(productId).toArray())
  const group: ModifierGroup = {
    id: id(),
    product_id: productId,
    ...input,
    sort_order,
    deleted_at: null,
    sync_status: 'pending',
    ...timestamps(),
  }
  await db.modifierGroups.add(group)
  return group.id
}

export async function updateModifierGroup(groupId: string, input: ModifierGroupInput): Promise<void> {
  const group = await db.modifierGroups.get(groupId)
  if (!group) return
  await db.modifierGroups.put(touch({ ...group, ...input }))
}

/** Soft-deletes a modifier group along with its (non-deleted) options. */
export async function deleteModifierGroup(groupId: string): Promise<void> {
  await db.transaction('rw', [db.modifierGroups, db.modifierOptions], async () => {
    const deleted_at = new Date().toISOString()
    const options = notDeleted(await db.modifierOptions.where('modifier_group_id').equals(groupId).toArray())
    for (const option of options) {
      await db.modifierOptions.put(touch({ ...option, deleted_at }))
    }
    const group = await db.modifierGroups.get(groupId)
    if (!group) return
    await db.modifierGroups.put(touch({ ...group, deleted_at }))
  })
}

export async function reorderModifierGroups(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', [db.modifierGroups], async () => {
    await Promise.all(
      orderedIds.map(async (groupId, index) => {
        const group = await db.modifierGroups.get(groupId)
        if (!group || group.sort_order === index) return
        await db.modifierGroups.put(touch({ ...group, sort_order: index }))
      }),
    )
  })
}

// ---------- Modifier Options ----------

export interface ModifierOptionInput {
  name: string
  price_adjustment: number
  cost_adjustment: number | null
  deducts_stock: boolean
  deduct_qty: number
}

export async function createModifierOption(groupId: string, input: ModifierOptionInput): Promise<string> {
  const sort_order = await nextSortOrder(() =>
    db.modifierOptions.where('modifier_group_id').equals(groupId).toArray(),
  )
  const option: ModifierOption = {
    id: id(),
    modifier_group_id: groupId,
    ...input,
    sort_order,
    deleted_at: null,
    sync_status: 'pending',
    ...timestamps(),
  }
  await db.modifierOptions.add(option)
  return option.id
}

export async function updateModifierOption(optionId: string, input: ModifierOptionInput): Promise<void> {
  const option = await db.modifierOptions.get(optionId)
  if (!option) return
  await db.modifierOptions.put(touch({ ...option, ...input }))
}

export async function deleteModifierOption(optionId: string): Promise<void> {
  const option = await db.modifierOptions.get(optionId)
  if (!option) return
  await db.modifierOptions.put(touch({ ...option, deleted_at: new Date().toISOString() }))
}

export async function reorderModifierOptions(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', [db.modifierOptions], async () => {
    await Promise.all(
      orderedIds.map(async (optionId, index) => {
        const option = await db.modifierOptions.get(optionId)
        if (!option || option.sort_order === index) return
        await db.modifierOptions.put(touch({ ...option, sort_order: index }))
      }),
    )
  })
}

// ---------- Images ----------

export { storeProductImage } from '../../lib/imageStorage'
