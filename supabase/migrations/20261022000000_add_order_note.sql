-- Optional free-text order-wide note entered at the Register's Checkout screen
-- (e.g. "customer is waiting outside", "pack separately"). Shown on /kitchen,
-- /fulfillment and Order History detail; never printed on the customer receipt.
-- Purely additive: nullable, no default, so no existing row is rewritten and no
-- updated_at changes (ALTER TABLE ADD COLUMN fires no row triggers).
--
-- Must be applied BEFORE deploying the frontend that writes `note`: sync push upserts
-- the whole Dexie row (src/sync/push.ts), so a missing column would fail new Register
-- orders' pushes (they'd stay pending locally, not lost, until the column exists).

alter table orders
  add column if not exists note text;
