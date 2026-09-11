-- Tier B.2 (RLS hardening): replaces the blanket `anon_full_access ... using (true)`
-- policy on every table with per-verb, per-role policies, scoped to what each table's
-- actual anon-facing routes (/order, /kitchen, /fulfillment — none of them behind any
-- login) legitimately need. `authenticated` (the one shared device credential the iPad
-- PWA signs into once — see src/lib/deviceAuth.ts) keeps full CRUD everywhere.
--
-- Rollout order matters: this migration must not ship until every iPad reliably
-- establishes/refreshes its device session (Tier B.1's client code, deployed first
-- under the old permissive policy). Applying this before that would break Login,
-- Settings->Users, clock-in, and Cloud Backup on any iPad still running old code,
-- since those flows are anon-authenticated today.
--
-- Every policy change is paired with an explicit REVOKE: 20260821020000_grant_anon_
-- table_privileges.sql granted blanket table-level CRUD to anon independent of RLS,
-- and RLS only filters rows on top of whatever GRANT already exists — dropping/
-- recreating a policy alone does not remove access without the matching REVOKE.

-- ---------- Read-only-to-anon catalog/settings tables ----------
-- (categories, products, modifier_groups, modifier_options, business_settings)
-- /order reads these to render the menu; nothing in /order, /kitchen, or /fulfillment
-- ever writes to them — catalog/settings edits are a manager-only, iPad-side flow.

do $$
declare t text;
begin
  for t in select unnest(array[
    'categories', 'products', 'modifier_groups', 'modifier_options', 'business_settings'
  ])
  loop
    execute format('drop policy if exists anon_full_access on %I', t);
    execute format('create policy anon_read_only on %I for select to anon using (true)', t);
    execute format(
      'create policy authenticated_full_access on %I for all to authenticated using (true) with check (true)', t
    );
    execute format('revoke insert, update, delete on %I from anon', t);
  end loop;
end $$;

-- ---------- orders: row-scoped to active kitchen_status only ----------
-- anon (kitchen: pending_confirmation/preparing, fulfillment: ready/out_for_delivery,
-- /order: insert only, never selects/updates its own order back) must never see
-- completed/served/picked_up/delivered/cancelled/voided rows — that's the entire
-- historical sales record, which is what made "anyone can browse our whole order
-- history via the API" possible before this migration.
drop policy if exists anon_full_access on orders;

create policy anon_select_active on orders for select to anon
  using (kitchen_status in ('pending_confirmation', 'preparing', 'ready', 'out_for_delivery'));

-- New online orders (src/features/order/orderSupabaseData.ts) are always created at
-- pending_confirmation or preparing (see getInitialKitchenStatus in lib/orderWorkflow.ts)
-- — constraining the insert here means a direct API insert can't drop a row straight
-- into a terminal/hidden state.
create policy anon_insert on orders for insert to anon
  with check (kitchen_status in ('pending_confirmation', 'preparing'));

-- `using` gates which rows anon can target (only currently-active ones); `with check`
-- intentionally allows the new row to move to a terminal status (e.g. markPickedUp
-- setting 'picked_up') — the row then simply falls out of anon's visible set on the
-- next query, which is exactly how kitchen/fulfillment already expect a card to
-- disappear (see the client-side isActive/isInScope checks in those features).
create policy anon_update_active on orders for update to anon
  using (kitchen_status in ('pending_confirmation', 'preparing', 'ready', 'out_for_delivery'))
  with check (true);

create policy authenticated_full_access on orders for all to authenticated using (true) with check (true);
revoke delete on orders from anon;

-- ---------- order_lines: same active-order scoping, via a direct join ----------
-- anon only ever inserts these (checkout) or reads them (kitchen/fulfillment ticket
-- display) — never updates or deletes an existing line directly.
drop policy if exists anon_full_access on order_lines;
create policy anon_select_active on order_lines for select to anon
  using (exists (
    select 1 from orders o where o.id = order_lines.order_id
    and o.kitchen_status in ('pending_confirmation', 'preparing', 'ready', 'out_for_delivery')
  ));
create policy anon_insert on order_lines for insert to anon with check (true);
create policy authenticated_full_access on order_lines for all to authenticated using (true) with check (true);
revoke update, delete on order_lines from anon;

-- ---------- order_line_modifiers: same scoping, one level further via order_lines ----------
-- (order_line_modifiers has no order_id of its own — it joins to orders via
-- order_line_id -> order_lines.order_id.)
drop policy if exists anon_full_access on order_line_modifiers;
create policy anon_select_active on order_line_modifiers for select to anon
  using (exists (
    select 1 from order_lines ol
    join orders o on o.id = ol.order_id
    where ol.id = order_line_modifiers.order_line_id
    and o.kitchen_status in ('pending_confirmation', 'preparing', 'ready', 'out_for_delivery')
  ));
create policy anon_insert on order_line_modifiers for insert to anon with check (true);
create policy authenticated_full_access on order_line_modifiers for all to authenticated using (true) with check (true);
revoke update, delete on order_line_modifiers from anon;

-- ---------- payments: insert-only for anon ----------
-- checkout (src/features/order/orderSupabaseData.ts) inserts a payment; nothing in
-- /order, /kitchen, or /fulfillment ever reads or updates one.
drop policy if exists anon_full_access on payments;
create policy anon_insert on payments for insert to anon with check (true);
create policy authenticated_full_access on payments for all to authenticated using (true) with check (true);
revoke select, update, delete on payments from anon;

-- ---------- sync_conflicts: give `authenticated` the full access every other table
-- gets, alongside the anon-insert-only policy 20260911010000_lock_down_sync_conflicts
-- already set up. That migration predates `authenticated` existing as a role anything
-- syncs under, so it only ever added an anon policy — leaving `authenticated` with zero
-- policies on this table. The table-level GRANT to authenticated already exists (from
-- 20260821020000_grant_anon_table_privileges.sql), but RLS defaults to deny with no
-- matching policy regardless of GRANT, which silently broke the device's own
-- conflict-aware push (pushConflictAware in sync/push.ts) the first time it needed to
-- log one.
create policy authenticated_full_access on sync_conflicts for all to authenticated using (true) with check (true);

-- ---------- authenticated-only: users, shifts, stock_adjustments, order_discounts ----------
-- Confirmed via code search: no route in /order, /kitchen, or /fulfillment touches any
-- of these tables in any way — they're exclusively used by the iPad PWA (PIN login/
-- clock-in, Settings->Users, Inventory restock, Senior/PWD discounts).
do $$
declare t text;
begin
  for t in select unnest(array['users', 'shifts', 'stock_adjustments', 'order_discounts'])
  loop
    execute format('drop policy if exists anon_full_access on %I', t);
    execute format(
      'create policy authenticated_full_access on %I for all to authenticated using (true) with check (true)', t
    );
    execute format('revoke select, insert, update, delete on %I from anon', t);
  end loop;
end $$;
