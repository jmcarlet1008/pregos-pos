-- Fixes a production bug from the Tier B.2 RLS migration: markServed/markPickedUp/
-- markDelivered (fulfillmentSupabaseData.ts) all moved kitchen_status OUT of the
-- anon-visible active set ('served'/'picked_up'/'delivered' are none of
-- 'pending_confirmation'/'preparing'/'ready'/'out_for_delivery'). That broke every one
-- of them with "new row violates row-level security policy for table orders", even
-- though the UPDATE policy itself has `with check (true)`.
--
-- Root cause (verified directly against Postgres, not just PostgREST): for UPDATE,
-- Postgres additionally requires the resulting row to satisfy the table's SELECT
-- policy for that role, independent of the UPDATE policy's own WITH CHECK. A plain
-- table UPDATE policy structurally cannot express "may write a row it can no longer
-- read afterward" — anon_select_active intentionally hides exactly these terminal
-- states, so any anon UPDATE landing on one is blocked no matter how permissive the
-- UPDATE policy's WITH CHECK is (confirmed empirically: even a bare
-- `using (true) with check (true)` UPDATE policy still fails here).
--
-- Fix: a SECURITY DEFINER function is the standard way to allow a narrowly-scoped
-- write that plain row policies can't express. It runs as its owner (bypassing RLS
-- internally) but only performs exactly the 3 specific forward transitions
-- fulfillment needs, validated against the current state server-side — anon can't use
-- it to jump straight to an arbitrary status or touch a row outside this transition
-- set.

create or replace function public.complete_order_fulfillment(
  p_order_id text,
  p_new_kitchen_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  select kitchen_status into v_current from orders where id = p_order_id;
  if v_current is null then
    raise exception 'Order % not found', p_order_id;
  end if;

  -- Mirrors FULFILLMENT_STATUSES in fulfillmentSupabaseData.ts: fulfillment only ever
  -- shows 'ready' or 'out_for_delivery' orders, so those are the only valid starting
  -- points for any of these 3 completion actions.
  if not (
    (p_new_kitchen_status = 'served' and v_current = 'ready') or
    (p_new_kitchen_status = 'picked_up' and v_current = 'ready') or
    (p_new_kitchen_status = 'delivered' and v_current = 'out_for_delivery')
  ) then
    raise exception 'Invalid fulfillment transition from % to %', v_current, p_new_kitchen_status;
  end if;

  -- Matches markPickedUp/markDelivered's existing completed_at semantics (set once, at
  -- completion) and markServed's (deliberately left alone — see fulfillmentSupabaseData.ts).
  update orders
  set
    kitchen_status = p_new_kitchen_status,
    status = case when p_new_kitchen_status in ('picked_up', 'delivered') then 'completed' else status end,
    completed_at = case when p_new_kitchen_status in ('picked_up', 'delivered') then now() else completed_at end,
    updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.complete_order_fulfillment(text, text) from public;
grant execute on function public.complete_order_fulfillment(text, text) to anon, authenticated;
