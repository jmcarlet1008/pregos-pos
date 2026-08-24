-- Order Management's "Edit Items" action (src/features/orderManagement/EditOrderItemsFlow.tsx):
-- lets a manager add/remove/modify an online or phone order's line items while it's
-- still in the kitchen queue (kitchen_status pending_confirmation/preparing). Kitchen
-- needs to be told when that happens, not left with a stale item list — these two
-- columns are that signal.
--
-- items_edited_at is a version marker (not a display value): both /kitchen's
-- useKitchenQueue and Order Management's useOrderManagementQueue currently fetch an
-- order's lines/modifiers exactly once, on first sight, on the assumption they're
-- immutable post-creation (see kitchenSupabaseData.ts's ingestOrder comment). This
-- feature breaks that assumption, so both hooks compare incoming items_edited_at
-- against what they've cached to decide whether to refetch lines — comparing on this
-- dedicated field rather than the general-purpose updated_at, which changes on every
-- unrelated write (queue_priority drag, prep_time_override, requested_time edit) and
-- would otherwise trigger a refetch (and, on /kitchen, a chime) for no reason.
--
-- items_edit_note is the human-readable side of the same edit, e.g. "+1 item, -1 item,
-- 1 modified" — shown as a badge on KitchenOrderCard. Both columns are cleared back to
-- null together by kitchenSupabaseData.ts's markReady, once the kitchen has acted on
-- the order past the point further edits are allowed.
--
-- Purely additive, safe to apply while the currently-deployed app is still running —
-- same shape as this session's other two migrations.

alter table orders
  add column if not exists items_edited_at timestamptz,
  add column if not exists items_edit_note text;
