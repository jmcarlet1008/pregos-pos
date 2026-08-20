-- Cost-tracking / Profit reporting support.
-- See src/db/schema.ts Product.cost_price / OrderLine.unit_cost for the matching Dexie
-- (local) schema.
--
-- Both columns are nullable with NO default: null means "cost not yet entered." The app
-- must render this as "N/A"/unknown, never silently treat it as 0 (which would fabricate
-- profit). Purely additive: safe to apply while the currently-deployed (old) app is still
-- running, since old app code never reads or writes these columns.

alter table products add column if not exists cost_price numeric(12, 2);
alter table order_lines add column if not exists unit_cost numeric(12, 2);
