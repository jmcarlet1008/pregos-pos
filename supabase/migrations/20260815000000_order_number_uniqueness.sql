-- Enforces uniqueness on orders.order_number.
--
-- Backstory: order_number is generated client-side (see getNextOrderNumber in
-- src/features/register/registerData.ts — "my local max + 1"), with no server-side
-- coordination across devices. That's a real race condition: two devices creating
-- orders around the same time, or a device whose local history has ever diverged from
-- what's already in Supabase, can independently land on the same order_number for two
-- entirely different orders. This surfaced in production as ~20 colliding rows
-- (investigated and manually reconciled on 2026-08-20 — the real/valuable rows were
-- left untouched, the worthless ₱0 duplicate artifacts were renumbered into the
-- 90000+ range to preserve them as history without them occupying a real number).
--
-- This index turns any *future* collision into a loud, visible sync error (the push
-- upsert will fail with a unique-violation) instead of a silent, hard-to-notice data
-- problem like the one just fixed. It does not, on its own, fix the underlying race —
-- see the follow-up work tracked for making order-number assignment collision-safe
-- (client-side auto-recovery on a unique-violation push error).

create unique index if not exists orders_order_number_unique_idx on orders (order_number);
