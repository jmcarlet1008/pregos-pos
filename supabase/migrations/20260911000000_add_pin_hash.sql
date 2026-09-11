-- Tier A.1 (PIN security): add a hashed PIN column and backfill it from the existing
-- plaintext `pin` column. Purely additive/non-destructive — `pin` is kept (now
-- nullable) so this is safe to run against the live database with real staff PINs
-- with zero app-visible effect, since nothing reads pin_hash until the client code
-- (schema.ts v6 / AuthContext.tsx / usersData.ts) ships.
--
-- Hash approach: unsalted sha256, matching src/lib/pinHash.ts client-side. See that
-- file's doc comment for why unsalted is the right choice for a 4-digit PIN. pgcrypto
-- is already enabled (20260722000000_init_schema.sql), so digest() needs no new
-- extension.
--
-- Sequencing (do not reorder): this migration ships first and is a no-op until the
-- matching client release lands. Once every device is confirmed running client code
-- that writes pin_hash instead of pin, a later migration drops the `pin` column
-- entirely (not part of this file — see the plan for that follow-up).

alter table users add column if not exists pin_hash text;
alter table users alter column pin drop not null;

update users
set pin_hash = encode(digest(pin, 'sha256'), 'hex')
where pin_hash is null and pin is not null;
