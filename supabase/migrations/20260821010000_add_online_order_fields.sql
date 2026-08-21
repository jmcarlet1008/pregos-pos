-- Online ordering at /order: adds the checkout fields an online order needs on top of
-- the in-store order shape, plus two pieces of groundwork the public route depends on.
--
-- order_number is deliberately NOT assigned here — it stays NULL, same as an
-- unnumbered Register cart (see 20260815010000_order_number_lazy.sql). Computing
-- "local max + 1" client-side from a public, unauthenticated, no-Dexie page would
-- reintroduce the exact cross-device collision bug fixed in
-- 20260815000000_order_number_uniqueness.sql. A future staff-side view assigns the
-- real number when someone first acts on the order, mirroring how Register assigns it
-- on an order's first line rather than at creation.

alter table orders
  add column if not exists channel text not null default 'in_store' check (channel in ('in_store', 'online')),
  add column if not exists fulfillment_type text check (fulfillment_type in ('pickup', 'delivery')),
  add column if not exists delivery_zone text,
  add column if not exists delivery_address jsonb,
  add column if not exists delivery_lat numeric(9, 6),
  add column if not exists delivery_lng numeric(9, 6),
  add column if not exists requested_time timestamptz,
  add column if not exists payment_method text check (payment_method in ('cash', 'gcash')),
  add column if not exists cash_tendered_amount numeric(12, 2),
  add column if not exists gcash_customer_confirmed boolean,
  add column if not exists customer_name text,
  add column if not exists customer_contact text;

alter table order_lines
  add column if not exists remarks text;

-- ---------- RLS: no change here (see history) ----------
-- An earlier version of this migration dropped the DELETE grant from every table's
-- anon_full_access policy, on the theory that nothing in the app performs a remote
-- delete (sync only upserts — src/sync/push.ts). That theory was wrong:
-- restoreCloudBackup() (src/features/settings/cloudBackupData.ts, wired into Settings
-- via CloudBackupRestoreSection.tsx) genuinely issues
-- `supabase.from(table).delete().not('id', 'is', null)` against every SYNC_TABLES
-- table as part of its wipe-and-reinsert restore flow — a real, UI-reachable manager
-- feature that would have broken. Since that feature touches essentially the whole
-- table list, there's no meaningful subset left to restrict, so the
-- anon_full_access ("for all") policy from 20260722000000_init_schema.sql is left
-- exactly as-is here.
--
-- Also NOT addressed, for a different reason: `users` (including the `pin` column)
-- and `shifts` remain fully anon-readable/writable regardless. Staff PIN login works
-- by syncing the whole `users` table down into each device's local Dexie cache and
-- checking PINs locally — there's no Supabase Auth session anywhere in this app to key
-- a tighter policy off of (see the note at the top of 20260722000000_init_schema.sql),
-- and restricting anon SELECT on `users` would break staff login on any device that
-- re-syncs, since Postgres can't tell a staff iPad's connection apart from a
-- customer's phone — both use the identical anon role. Closing that exposure needs a
-- real auth model change (Supabase Auth for staff, or a server-side PIN-check
-- function) — out of scope here, tracked as a known limitation.

-- ---------- Realtime: business_settings ----------
-- /order subscribes to postgres_changes on business_settings so a manual open/closed
-- toggle or a delivery-window edit reaches an already-open customer tab instantly.
-- postgres_changes only fires for tables in the supabase_realtime publication, so make
-- sure this one is in it. Guarded against re-running this migration and against a
-- fresh local Supabase instance where the publication may not exist yet.
do $$
begin
  alter publication supabase_realtime add table business_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
