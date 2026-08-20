-- Modifier-level cost tracking (e.g. a "Large" size upgrade's actual cost, distinct
-- from its price_adjustment). See src/db/schema.ts ModifierOption.cost_adjustment /
-- OrderLineModifier.unit_cost_adjustment for the matching Dexie (local) schema.
--
-- Both columns are nullable with NO default: null means "cost not yet entered." The app
-- must render this as "N/A"/unknown, never silently treat it as 0. Purely additive: safe
-- to apply while the currently-deployed (old) app is still running.

alter table modifier_options add column if not exists cost_adjustment numeric(12, 2);
alter table order_line_modifiers add column if not exists unit_cost_adjustment numeric(12, 2);
