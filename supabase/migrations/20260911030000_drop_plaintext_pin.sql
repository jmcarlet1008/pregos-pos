-- Phase 3 of the PIN hashing rollout (see 20260911000000_add_pin_hash.sql for phase 1
-- and 2). Drops the leftover plaintext `pin` column now that pin_hash-based login
-- (src/lib/pinHash.ts, schema.ts v6) has been confirmed working in production and the
-- matching client cleanup (schema.ts v7, which also strips `pin` from every device's
-- local IndexedDB) has shipped.
--
-- Sequencing: do not run this until the v7 client code is deployed and confirmed
-- syncing normally — a device still on v6-or-earlier code that has a pending local
-- `users` row with a stray `pin` field would fail to push once this column is gone
-- (upsert referencing a column that no longer exists).

alter table users drop column if exists pin;
