-- Order numbers are now assigned lazily (on an order's first line, not at creation) —
-- see getNextOrderNumber/createOrder/addOrderLine in
-- src/features/register/registerData.ts.
--
-- Root cause this closes out: createOrder previously assigned a real order_number the
-- instant the Register screen opened, even to a completely empty cart — so every app
-- boot/reload/test session quietly burned a number. That's what produced the ~20
-- historical duplicate/junk rows fixed on 2026-08-20 (see
-- 20260815000000_order_number_uniqueness.sql) and the runaway 90000+ numbers from a
-- test browser's repeated empty-cart reloads on the same day. An empty cart no longer
-- gets a number at all, so this class of problem can't recur.
--
-- The unique index added in 20260815000000 still holds: Postgres treats every NULL in
-- a unique index as distinct from every other NULL, so any number of un-numbered
-- (order_number IS NULL) orders can coexist across devices with zero conflict — only
-- *assigned* numbers are required to be unique, which is exactly what we want.

alter table orders alter column order_number drop not null;
