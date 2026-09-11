-- Fixes another production bug from the Tier B.2 RLS migration: new online orders
-- (and any /kitchen lazily backfills) were getting stuck with no order_number at all
-- (displayed as "#--"). assignOrderNumberIfMissing (kitchenSupabaseData.ts) computes
-- "next number" via an unfiltered `select order_number ... order by ... desc limit 1`
-- — but anon can now only SELECT currently-active orders (anon_select_active), so that
-- query returns the max among a handful of active orders instead of the true
-- all-time max. The computed "next" number then collides with the unique constraint
-- on order_number (used by real historical orders anon can no longer see), the update
-- fails, and after 3 retries (all recomputing the same wrong, too-low max) the order is
-- left unnumbered permanently.
--
-- Fix: same pattern as complete_order_fulfillment — a SECURITY DEFINER function that
-- computes the true max (bypassing RLS internally) and performs the assignment
-- atomically. Idempotent (returns the existing number if the order already has one) so
-- it's safe to call from both /order (at submission) and /kitchen (lazy backfill) the
-- same way the client already did.

create or replace function public.assign_order_number_if_missing(p_order_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing integer;
  v_next integer;
begin
  select order_number into v_existing from orders where id = p_order_id;
  if v_existing is not null then
    return v_existing;
  end if;

  select coalesce(max(order_number), 0) + 1 into v_next from orders;

  update orders set order_number = v_next, updated_at = now()
  where id = p_order_id and order_number is null;

  return v_next;
end;
$$;

revoke all on function public.assign_order_number_if_missing(text) from public;
grant execute on function public.assign_order_number_if_missing(text) to anon, authenticated;
