-- Order Management dashboard: widens `channel` to add 'phone' (manually-entered
-- phone/manual orders taken by a Manager/cashier — see
-- src/features/orderManagement/orderManagementSupabaseData.ts's createManualOrder),
-- and adds `cancellation_reason` for its Cancel action.
--
-- Postgres has no in-place widen for a plain CHECK constraint, so the channel check is
-- dropped and recreated. Purely additive to the allowed-value set — no existing row's
-- channel value is touched — so this is safe to apply while the currently-deployed app
-- is still running, same shape as 20260822000000_add_kitchen_status.sql.

alter table orders drop constraint if exists orders_channel_check;
alter table orders add constraint orders_channel_check
  check (channel in ('in_store', 'online', 'phone'));

-- cancellation_reason: free-text, manager-entered note captured when Order Management
-- cancels an order. No existing column fits — customer_name/customer_contact are
-- customer-supplied, and order_lines.remarks is per-line, not per-order. Nullable,
-- unconstrained (free text, not an enum), never queried by index.
alter table orders add column if not exists cancellation_reason text;

-- No RLS/grant/publication work needed: orders already carries anon_full_access from
-- the init migration (20260722000000_init_schema.sql) and 20260821020000 already fixed
-- the base table-level GRANTs that policy depends on — new columns inherit both
-- automatically. `orders` is already in the supabase_realtime publication (added in
-- 20260822000000_add_kitchen_status.sql), so Order Management's subscription needs no
-- new publication work either.
--
-- stock_adjustments.reason already allows 'void' (stock_adjustments_reason_check, see
-- 20260722000000_init_schema.sql) — Order Management's cancelOrder() reuses that value
-- for its stock-reversal rows, same as checkoutData.ts's voidOrder(), so no change
-- needed there.
