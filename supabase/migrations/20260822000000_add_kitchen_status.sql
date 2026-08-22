-- Prompt 12 (/kitchen): adds the central kitchen-workflow status field, shared by
-- /kitchen (this prompt) and the /fulfillment hand-off screen (a later prompt) — see
-- src/db/schema.ts's KitchenStatus/KITCHEN_STATUSES and src/lib/orderWorkflow.ts for the
-- matching Dexie type and all derived logic.
--
-- kitchen_status carries an order from creation through to hand-off:
--   new -> (pending_confirmation, manual-confirmation delivery zones only) -> preparing
--   -> ready -> served | picked_up | (out_for_delivery -> delivered)
-- 'cancelled' is included in the check constraint now even though nothing writes it yet
-- (Order Management, a future prompt, is the only place that will) so that prompt needs
-- no further migration.
--
-- queue_priority is a nullable, unconstrained numeric sort-order override: null means
-- "sort by computed start-by time" (see orderWorkflow.ts's computeSortEpoch); a number
-- means a staff member manually reordered this one order (on /kitchen, or later from
-- Order Management) — deliberately unconstrained precision/scale, since the values
-- stored are epoch-millisecond-scale sort keys (~13 digits), not currency.
--
-- Both columns are additive with a default, safe to apply while the currently-deployed
-- app is still running. No new RLS/grant work needed — business_settings/orders already
-- carry the anon_full_access policy from the init migration, and 20260821020000 already
-- fixed the base table-level GRANTs that policy depends on; those apply to new columns
-- automatically.

alter table orders
  add column if not exists kitchen_status text not null default 'new'
    check (kitchen_status in (
      'new', 'pending_confirmation', 'preparing', 'ready',
      'served', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'
    )),
  add column if not exists queue_priority numeric;

create index if not exists orders_kitchen_status_idx on orders (kitchen_status);

-- ---------- Realtime: orders ----------
-- /kitchen subscribes to postgres_changes on orders (unfiltered — see
-- src/features/kitchen/kitchenSupabaseData.ts for why a server-side filter would miss
-- the events that move an order OUT of scope) so a dine-in sale, a new online order, or
-- a status change reaches an already-open kitchen station instantly. Same guarded
-- pattern as 20260821010000's business_settings addition, so this is safe to re-run and
-- safe against a fresh local Supabase instance where the publication may not exist yet.
do $$
begin
  alter publication supabase_realtime add table orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
