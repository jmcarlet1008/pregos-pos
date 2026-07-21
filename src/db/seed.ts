import { BUSINESS_SETTINGS_ID, db, type BusinessSettings, type Category, type ModifierGroup, type ModifierOption, type Product, type User } from './schema'

/**
 * Fixed ids for every seeded row. Seeding must be idempotent across devices: if two
 * separate iPads each seed their own local database before ever syncing, their rows
 * need to converge on the same ids once synced to Supabase — otherwise every device's
 * "Pizza" category ends up as a distinct row and the sync engine (correctly) merges
 * all of them in as siblings, duplicating the whole catalog. crypto.randomUUID() per
 * device defeats that; these constants don't.
 */
const SEED_IDS = {
  userMaria: '00000000-0000-4000-8000-000000000001',
  userChef: '00000000-0000-4000-8000-000000000002',
  categoryPizza: '00000000-0000-4000-8000-000000000010',
  categoryPasta: '00000000-0000-4000-8000-000000000011',
  categoryDrinks: '00000000-0000-4000-8000-000000000012',
  productMargherita: '00000000-0000-4000-8000-000000000020',
  productPepperoni: '00000000-0000-4000-8000-000000000021',
  productSpaghetti: '00000000-0000-4000-8000-000000000022',
  productFettuccine: '00000000-0000-4000-8000-000000000023',
  productIcedTea: '00000000-0000-4000-8000-000000000024',
  productBottledWater: '00000000-0000-4000-8000-000000000025',
  modGroupAddOns: '00000000-0000-4000-8000-000000000030',
  modGroupSize: '00000000-0000-4000-8000-000000000031',
  modOptExtraCheese: '00000000-0000-4000-8000-000000000040',
  modOptMushrooms: '00000000-0000-4000-8000-000000000041',
  modOptExtraBasil: '00000000-0000-4000-8000-000000000042',
  modOptRegular: '00000000-0000-4000-8000-000000000043',
  modOptLarge: '00000000-0000-4000-8000-000000000044',
} as const

function timestamps() {
  const now = new Date().toISOString()
  return { created_at: now, updated_at: now }
}

/** Seeds sample staff PINs on first run. No-op if users already exist. */
async function seedUsers() {
  const existing = await db.users.count()
  if (existing > 0) return

  const users: User[] = [
    { id: SEED_IDS.userMaria, name: 'Maria Santos', pin: '1234', role: 'cashier', active: true, sync_status: 'pending', ...timestamps() },
    { id: SEED_IDS.userChef, name: 'Chef Prego', pin: '9999', role: 'manager', active: true, sync_status: 'pending', ...timestamps() },
  ]
  await db.users.bulkAdd(users)
}

/** Seeds the default business profile on first run. No-op if a record already exists. */
async function seedBusinessSettings() {
  const existing = await db.businessSettings.count()
  if (existing > 0) return

  const settings: BusinessSettings = {
    id: BUSINESS_SETTINGS_ID,
    name: "Prego's Cucina",
    logo_url: null,
    address: '',
    phone: '',
    sync_status: 'pending',
    ...timestamps(),
  }
  await db.businessSettings.add(settings)
}

/** Seeds a small sample menu on first run. No-op if categories already exist. */
export async function seedDatabase() {
  await seedUsers()
  await seedBusinessSettings()

  const existing = await db.categories.count()
  if (existing > 0) return

  await db.transaction(
    'rw',
    [db.categories, db.products, db.modifierGroups, db.modifierOptions],
    async () => {
      const categories: Category[] = [
        { id: SEED_IDS.categoryPizza, name: 'Pizza', sort_order: 0, active: true, sync_status: 'pending', ...timestamps() },
        { id: SEED_IDS.categoryPasta, name: 'Pasta', sort_order: 1, active: true, sync_status: 'pending', ...timestamps() },
        { id: SEED_IDS.categoryDrinks, name: 'Drinks', sort_order: 2, active: true, sync_status: 'pending', ...timestamps() },
      ]
      await db.categories.bulkAdd(categories)

      const products: Product[] = [
        {
          id: SEED_IDS.productMargherita,
          name: 'Margherita Pizza',
          category_id: SEED_IDS.categoryPizza,
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
          id: SEED_IDS.productPepperoni,
          name: 'Pepperoni Pizza',
          category_id: SEED_IDS.categoryPizza,
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
          id: SEED_IDS.productSpaghetti,
          name: 'Spaghetti Bolognese',
          category_id: SEED_IDS.categoryPasta,
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
          id: SEED_IDS.productFettuccine,
          name: 'Fettuccine Alfredo',
          category_id: SEED_IDS.categoryPasta,
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
          id: SEED_IDS.productIcedTea,
          name: 'Iced Tea',
          category_id: SEED_IDS.categoryDrinks,
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
          id: SEED_IDS.productBottledWater,
          name: 'Bottled Water',
          category_id: SEED_IDS.categoryDrinks,
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

      const modifierGroups: ModifierGroup[] = [
        {
          id: SEED_IDS.modGroupAddOns,
          product_id: SEED_IDS.productMargherita,
          name: 'Add-ons',
          required: false,
          min_picks: 0,
          max_picks: 3,
          sort_order: 0,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: SEED_IDS.modGroupSize,
          product_id: SEED_IDS.productPepperoni,
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

      const modifierOptions: ModifierOption[] = [
        {
          id: SEED_IDS.modOptExtraCheese,
          modifier_group_id: SEED_IDS.modGroupAddOns,
          name: 'Extra Cheese',
          price_adjustment: 50,
          deducts_stock: true,
          deduct_qty: 1,
          sort_order: 0,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: SEED_IDS.modOptMushrooms,
          modifier_group_id: SEED_IDS.modGroupAddOns,
          name: 'Mushrooms',
          price_adjustment: 40,
          deducts_stock: false,
          deduct_qty: 0,
          sort_order: 1,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: SEED_IDS.modOptExtraBasil,
          modifier_group_id: SEED_IDS.modGroupAddOns,
          name: 'Extra Basil',
          price_adjustment: 20,
          deducts_stock: false,
          deduct_qty: 0,
          sort_order: 2,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: SEED_IDS.modOptRegular,
          modifier_group_id: SEED_IDS.modGroupSize,
          name: 'Regular',
          price_adjustment: 0,
          deducts_stock: false,
          deduct_qty: 0,
          sort_order: 0,
          sync_status: 'pending',
          ...timestamps(),
        },
        {
          id: SEED_IDS.modOptLarge,
          modifier_group_id: SEED_IDS.modGroupSize,
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
