import { db, type Category, type ModifierGroup, type ModifierOption, type Product } from './schema'

function id() {
  return crypto.randomUUID()
}

function timestamps() {
  const now = new Date().toISOString()
  return { created_at: now, updated_at: now }
}

/** Seeds a small sample menu on first run. No-op if categories already exist. */
export async function seedDatabase() {
  const existing = await db.categories.count()
  if (existing > 0) return

  await db.transaction(
    'rw',
    [db.categories, db.products, db.modifierGroups, db.modifierOptions],
    async () => {
      const categories: Category[] = [
        { id: id(), name: 'Pizza', sort_order: 0, active: true, sync_status: 'pending', ...timestamps() },
        { id: id(), name: 'Pasta', sort_order: 1, active: true, sync_status: 'pending', ...timestamps() },
        { id: id(), name: 'Drinks', sort_order: 2, active: true, sync_status: 'pending', ...timestamps() },
      ]
      await db.categories.bulkAdd(categories)
      const [pizzaId, pastaId, drinksId] = categories.map((c) => c.id)

      const products: Product[] = [
        {
          id: id(),
          name: 'Margherita Pizza',
          category_id: pizzaId,
          price: 350,
          description: 'San Marzano tomato, fresh mozzarella, basil.',
          image_url: null,
          active: true,
          sort_order: 0,
          track_inventory: true,
          stock_on_hand: 25,
          par_level: 30,
          reorder_point: 10,
          unit: 'pcs',
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          name: 'Pepperoni Pizza',
          category_id: pizzaId,
          price: 420,
          description: 'Double pepperoni, mozzarella, house tomato sauce.',
          image_url: null,
          active: true,
          sort_order: 1,
          track_inventory: true,
          stock_on_hand: 8,
          par_level: 20,
          reorder_point: 10,
          unit: 'pcs',
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          name: 'Spaghetti Bolognese',
          category_id: pastaId,
          price: 280,
          description: 'Slow-braised beef ragu, parmesan.',
          image_url: null,
          active: true,
          sort_order: 0,
          track_inventory: true,
          stock_on_hand: 15,
          par_level: 20,
          reorder_point: 8,
          unit: 'pcs',
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          name: 'Fettuccine Alfredo',
          category_id: pastaId,
          price: 300,
          description: 'Fresh cream, parmesan, cracked pepper.',
          image_url: null,
          active: true,
          sort_order: 1,
          track_inventory: true,
          stock_on_hand: 12,
          par_level: 20,
          reorder_point: 8,
          unit: 'pcs',
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          name: 'Iced Tea',
          category_id: drinksId,
          price: 90,
          description: 'House-brewed, unsweetened or classic sweet.',
          image_url: null,
          active: true,
          sort_order: 0,
          track_inventory: true,
          stock_on_hand: 50,
          par_level: 60,
          reorder_point: 15,
          unit: 'pcs',
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          name: 'Bottled Water',
          category_id: drinksId,
          price: 60,
          description: '500ml still water.',
          image_url: null,
          active: true,
          sort_order: 1,
          track_inventory: false,
          stock_on_hand: 0,
          par_level: 0,
          reorder_point: 0,
          unit: 'pcs',
          sync_status: 'pending',
          ...timestamps(),
        },
      ]
      await db.products.bulkAdd(products)
      const [margheritaId, pepperoniId] = products.map((p) => p.id)

      const modifierGroups: ModifierGroup[] = [
        {
          id: id(),
          product_id: margheritaId,
          name: 'Add-ons',
          required: false,
          min_picks: 0,
          max_picks: 3,
          sort_order: 0,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          product_id: pepperoniId,
          name: 'Size',
          required: true,
          min_picks: 1,
          max_picks: 1,
          sort_order: 0,
          sync_status: 'pending',
          ...timestamps(),
        },
      ]
      await db.modifierGroups.bulkAdd(modifierGroups)
      const [addOnsGroupId, sizeGroupId] = modifierGroups.map((g) => g.id)

      const modifierOptions: ModifierOption[] = [
        {
          id: id(),
          modifier_group_id: addOnsGroupId,
          name: 'Extra Cheese',
          price_adjustment: 50,
          deducts_stock: true,
          deduct_qty: 1,
          sort_order: 0,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          modifier_group_id: addOnsGroupId,
          name: 'Mushrooms',
          price_adjustment: 40,
          deducts_stock: false,
          deduct_qty: 0,
          sort_order: 1,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          modifier_group_id: addOnsGroupId,
          name: 'Extra Basil',
          price_adjustment: 20,
          deducts_stock: false,
          deduct_qty: 0,
          sort_order: 2,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          modifier_group_id: sizeGroupId,
          name: 'Regular',
          price_adjustment: 0,
          deducts_stock: false,
          deduct_qty: 0,
          sort_order: 0,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: id(),
          modifier_group_id: sizeGroupId,
          name: 'Large',
          price_adjustment: 150,
          deducts_stock: false,
          deduct_qty: 0,
          sort_order: 1,
          sync_status: 'pending',
          ...timestamps(),
        },
      ]
      await db.modifierOptions.bulkAdd(modifierOptions)
    },
  )
}
