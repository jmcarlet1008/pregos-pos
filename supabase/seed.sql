-- Local dev seed data. Loaded automatically after migrations by `supabase db reset`
-- (see supabase/config.toml's [db.seed] sql_paths) so a fresh local Supabase instance
-- always comes back with a usable demo catalog, staff logins, and business settings.
--
-- This is the Postgres mirror of src/db/seed.ts's demo data, and deliberately reuses
-- the exact same fixed ids (SEED_IDS in that file). Same rationale as documented there
-- and in 20260821000000_add_delivery_settings.sql for DEFAULT_DELIVERY_ZONE_IDS: fixed
-- ids let two independently-seeded sources (a fresh local Dexie install, a fresh local
-- Supabase instance) converge on identical rows instead of duplicating the catalog the
-- first time they sync, if this database is ever pointed at from the app.
--
-- ON CONFLICT DO NOTHING makes re-running this file harmless (`supabase db reset`
-- always starts from empty migrated tables, but `supabase db seed` / a manual `psql -f
-- seed.sql` can hit a non-empty database).

-- ---------- Business Settings (singleton row) ----------
insert into business_settings (
  id, name, logo_url, address, phone,
  gcash_number, gcash_qr_image, accepting_orders_today,
  delivery_start_time, delivery_end_time, delivery_slot_interval_minutes,
  average_prep_time_minutes, delivery_zones
) values (
  'singleton', 'Prego''s Cucina', null, '123 Camella Drive, Cavite', '0917-555-0100',
  '0917-555-0199', null, true,
  '10:00', '21:00', 30,
  15, '[
    {"id": "00000000-0000-4000-8000-000000000050", "name": "Within Camella", "auto_route": true},
    {"id": "00000000-0000-4000-8000-000000000051", "name": "Outside Camella", "auto_route": false}
  ]'::jsonb
)
on conflict (id) do nothing;

-- ---------- Users (POS staff PIN logins) ----------
insert into users (id, name, pin, role, active) values
  ('00000000-0000-4000-8000-000000000001', 'Maria Santos', '1234', 'cashier', true),
  ('00000000-0000-4000-8000-000000000002', 'Chef Prego', '9999', 'manager', true)
on conflict (id) do nothing;

-- ---------- Categories ----------
insert into categories (id, name, sort_order, active) values
  ('00000000-0000-4000-8000-000000000010', 'Pizza', 0, true),
  ('00000000-0000-4000-8000-000000000011', 'Pasta', 1, true),
  ('00000000-0000-4000-8000-000000000012', 'Drinks', 2, true)
on conflict (id) do nothing;

-- ---------- Products ----------
insert into products (
  id, category_id, name, price, cost_price, description, image_url, active, sort_order,
  track_inventory, stock_on_hand, par_level, reorder_point, unit
) values
  ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000010',
   'Margherita Pizza', 350, null, 'San Marzano tomato, fresh mozzarella, basil.', null, true, 0,
   true, 25, 30, 10, 'pcs'),
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000010',
   'Pepperoni Pizza', 420, null, 'Double pepperoni, mozzarella, house tomato sauce.', null, true, 1,
   true, 8, 20, 10, 'pcs'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000011',
   'Spaghetti Bolognese', 280, null, 'Slow-braised beef ragu, parmesan.', null, true, 0,
   true, 15, 20, 8, 'pcs'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000011',
   'Fettuccine Alfredo', 300, null, 'Fresh cream, parmesan, cracked pepper.', null, true, 1,
   true, 12, 20, 8, 'pcs'),
  ('00000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000012',
   'Iced Tea', 90, null, 'House-brewed, unsweetened or classic sweet.', null, true, 0,
   true, 50, 60, 15, 'pcs'),
  ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000012',
   'Bottled Water', 60, null, '500ml still water.', null, true, 1,
   false, 0, 0, 0, 'pcs')
on conflict (id) do nothing;

-- ---------- Modifier Groups ----------
insert into modifier_groups (id, product_id, name, required, min_picks, max_picks, sort_order) values
  ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000020',
   'Add-ons', false, 0, 3, 0),
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000021',
   'Size', true, 1, 1, 0)
on conflict (id) do nothing;

-- ---------- Modifier Options ----------
insert into modifier_options (
  id, modifier_group_id, name, price_adjustment, cost_adjustment, deducts_stock, deduct_qty, sort_order
) values
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000030',
   'Extra Cheese', 50, null, true, 1, 0),
  ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000030',
   'Mushrooms', 40, null, false, 0, 1),
  ('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000030',
   'Extra Basil', 20, null, false, 0, 2),
  ('00000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000031',
   'Regular', 0, null, false, 0, 0),
  ('00000000-0000-4000-8000-000000000044', '00000000-0000-4000-8000-000000000031',
   'Large', 150, null, false, 0, 1)
on conflict (id) do nothing;
