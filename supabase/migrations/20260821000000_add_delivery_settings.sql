-- Online ordering groundwork: Delivery & Payment settings on BusinessSettings, plus
-- a per-order prep-time override on orders (used by the future Kitchen View).
-- See src/db/schema.ts's BusinessSettings/DeliveryZone/Order for the matching Dexie
-- (local) schema and DEFAULT_* constants.
--
-- All columns are additive with defaults, so this is safe to apply while the
-- currently-deployed (old) app is still running — old app code never reads or writes
-- these columns. No new RLS policy needed: business_settings and orders already carry
-- the generic anon_full_access policy applied to every table in the init migration.
--
-- delivery_zones seeds the same two starting zones, with the same fixed ids, as
-- src/db/schema.ts's DEFAULT_DELIVERY_ZONES — so a fresh Supabase-first pull and a
-- fresh local-first seed converge on identical rows instead of duplicating zones.

alter table business_settings
  add column if not exists gcash_number text not null default '',
  add column if not exists gcash_qr_image text,
  add column if not exists accepting_orders_today boolean not null default true,
  add column if not exists delivery_start_time text not null default '10:00',
  add column if not exists delivery_end_time text not null default '21:00',
  add column if not exists delivery_slot_interval_minutes integer not null default 30,
  add column if not exists average_prep_time_minutes integer not null default 15,
  add column if not exists delivery_zones jsonb not null default '[
    {"id": "00000000-0000-4000-8000-000000000050", "name": "Within Camella", "auto_route": true},
    {"id": "00000000-0000-4000-8000-000000000051", "name": "Outside Camella", "auto_route": false}
  ]'::jsonb;

-- Per-order override for the Kitchen View's prep-start calculation (Prompt 12): null
-- means "use business_settings.average_prep_time_minutes".
alter table orders
  add column if not exists prep_time_override_minutes integer;
