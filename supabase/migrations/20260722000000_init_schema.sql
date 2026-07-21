-- Prego's POS — cloud schema mirroring the Dexie (IndexedDB) schema in src/db/schema.ts.
--
-- Notes on design choices:
--  * `id` columns are `text`, not `uuid` — client-generated ids are almost always
--    crypto.randomUUID() strings, but business_settings uses the fixed id "singleton",
--    so a uniform text type avoids fighting Postgres's uuid parser.
--  * No foreign key constraints. The sync engine pushes tables in dependency order
--    within a cycle, but retries after a partial failure (e.g. a dropped connection
--    mid-cycle) can push a child row before its parent has re-synced. Offline-first
--    sync needs to tolerate that, so referential integrity is enforced by the app,
--    not the database. Indexes are added on FK-shaped columns for query performance.
--  * `sync_status` is intentionally NOT a column here — it's a local-only Dexie
--    concept. Every row that exists in these tables is, by definition, synced.
--  * RLS is enabled with a permissive "anon can do everything" policy. The app has
--    no Supabase Auth session — login is local PIN-based (src/features/auth) — so
--    there's no auth.uid() to key policies off of. This keeps the anon key's access
--    equivalent to a service key for this project's tables; treat the anon key as
--    sensitive despite normally being safe to ship to a client, and reassess if this
--    project ever needs per-device or per-location isolation.

create extension if not exists pgcrypto;

-- ---------- Categories ----------
create table if not exists categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_updated_at_idx on categories (updated_at);

-- ---------- Products ----------
create table if not exists products (
  id text primary key,
  category_id text not null,
  name text not null,
  price numeric(12, 2) not null default 0,
  description text not null default '',
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  track_inventory boolean not null default false,
  stock_on_hand numeric(12, 2) not null default 0,
  par_level numeric(12, 2) not null default 0,
  reorder_point numeric(12, 2) not null default 0,
  unit text not null default 'pcs',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_id_idx on products (category_id);
create index if not exists products_updated_at_idx on products (updated_at);

-- ---------- Modifier Groups ----------
create table if not exists modifier_groups (
  id text primary key,
  product_id text not null,
  name text not null,
  required boolean not null default false,
  min_picks integer not null default 0,
  max_picks integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists modifier_groups_product_id_idx on modifier_groups (product_id);
create index if not exists modifier_groups_updated_at_idx on modifier_groups (updated_at);

-- ---------- Modifier Options ----------
create table if not exists modifier_options (
  id text primary key,
  modifier_group_id text not null,
  name text not null,
  price_adjustment numeric(12, 2) not null default 0,
  deducts_stock boolean not null default false,
  deduct_qty numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists modifier_options_group_id_idx on modifier_options (modifier_group_id);
create index if not exists modifier_options_updated_at_idx on modifier_options (updated_at);

-- ---------- Users (POS staff, not Supabase Auth users) ----------
create table if not exists users (
  id text primary key,
  name text not null,
  pin text not null,
  role text not null check (role in ('cashier', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists users_updated_at_idx on users (updated_at);

-- ---------- Shifts ----------
create table if not exists shifts (
  id text primary key,
  user_id text not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  status text not null check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shifts_user_id_idx on shifts (user_id);
create index if not exists shifts_updated_at_idx on shifts (updated_at);

-- ---------- Orders ----------
create table if not exists orders (
  id text primary key,
  order_number integer not null,
  status text not null check (status in ('active', 'completed', 'voided')),
  total numeric(12, 2) not null default 0,
  shift_id text,
  user_id text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_order_number_idx on orders (order_number);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_updated_at_idx on orders (updated_at);

-- ---------- Order Lines ----------
create table if not exists order_lines (
  id text primary key,
  order_id text not null,
  product_id text not null,
  product_name text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_lines_order_id_idx on order_lines (order_id);
create index if not exists order_lines_updated_at_idx on order_lines (updated_at);

-- ---------- Order Line Modifiers ----------
create table if not exists order_line_modifiers (
  id text primary key,
  order_line_id text not null,
  modifier_option_id text not null,
  name text not null,
  price_adjustment numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_line_modifiers_line_id_idx on order_line_modifiers (order_line_id);
create index if not exists order_line_modifiers_updated_at_idx on order_line_modifiers (updated_at);

-- ---------- Payments ----------
create table if not exists payments (
  id text primary key,
  order_id text not null,
  method text not null check (method in ('cash', 'gcash')),
  amount_tendered numeric(12, 2) not null default 0,
  change numeric(12, 2) not null default 0,
  gcash_reference text,
  status text not null check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_id_idx on payments (order_id);
create index if not exists payments_updated_at_idx on payments (updated_at);

-- ---------- Stock Adjustments ----------
create table if not exists stock_adjustments (
  id text primary key,
  product_id text not null,
  delta numeric(12, 2) not null default 0,
  reason text not null check (reason in ('sale', 'manual', 'void', 'delivery', 'waste', 'correction')),
  order_id text,
  created_by text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stock_adjustments_product_id_idx on stock_adjustments (product_id);
create index if not exists stock_adjustments_updated_at_idx on stock_adjustments (updated_at);

-- ---------- Business Settings (singleton row, id = 'singleton') ----------
create table if not exists business_settings (
  id text primary key,
  name text not null default '',
  logo_url text,
  address text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Sync conflict audit log ----------
-- Populated only for conflict-aware entities (currently: orders). A sale is never
-- silently dropped or overwritten — when the sync engine detects that the server
-- row changed since this device last pulled, and the two versions disagree, both
-- sides are recorded here instead of picking a winner automatically.
create table if not exists sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  local_data jsonb not null,
  remote_data jsonb not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text
);
create index if not exists sync_conflicts_entity_idx on sync_conflicts (entity_type, entity_id);
create index if not exists sync_conflicts_unresolved_idx on sync_conflicts (resolved_at) where resolved_at is null;

-- ---------- Row Level Security ----------
-- See note at top of file: no Supabase Auth session exists client-side, so policies
-- are permissive for the anon role rather than keyed off auth.uid().
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'categories', 'products', 'modifier_groups', 'modifier_options',
      'users', 'shifts', 'orders', 'order_lines', 'order_line_modifiers',
      'payments', 'stock_adjustments', 'business_settings', 'sync_conflicts'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_full_access on %I', t);
    execute format(
      'create policy anon_full_access on %I for all to anon using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ---------- Storage: product images ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product-images public read" on storage.objects;
create policy "product-images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "product-images anon write" on storage.objects;
create policy "product-images anon write"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'product-images');

drop policy if exists "product-images anon update" on storage.objects;
create policy "product-images anon update"
  on storage.objects for update
  to anon
  using (bucket_id = 'product-images');

drop policy if exists "product-images anon delete" on storage.objects;
create policy "product-images anon delete"
  on storage.objects for delete
  to anon
  using (bucket_id = 'product-images');
