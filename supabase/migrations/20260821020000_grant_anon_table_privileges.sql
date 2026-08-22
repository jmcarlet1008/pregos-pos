-- Fixes "permission denied for table X" on every public-schema table for both the
-- anon and authenticated roles (surfaced 2026-08-21 via /order's business_settings
-- read, and as "Sync error — N pending" on Register once real seed data exercised the
-- sync engine's push/pull against a fresh local instance).
--
-- Root cause: every table in this project is created by migrations running as the
-- `postgres` role. On this Postgres image (supabase/postgres:17.6.1), the default
-- privileges for tables created by `postgres` grant only DELETE/REFERENCES/TRIGGER/
-- MAINTAIN to anon/authenticated — no SELECT/INSERT/UPDATE. Row Level Security (the
-- `anon_full_access` policies added in 20260722000000_init_schema.sql and
-- 20260722010000_add_order_discounts.sql) only decides which ROWS a role may touch
-- *after* it already holds the base table-level GRANT; it's not a substitute for one.
-- Tables under `storage.*` are unaffected because the Supabase platform creates those
-- as `supabase_admin`, whose default privileges already include full CRUD.
--
-- This grants every existing public table the same access its RLS policy already
-- implies (full CRUD, same as the "for all ... using (true) with check (true)" anon
-- policies), and sets the default for the `postgres` role going forward so a future
-- migration's `create table` doesn't silently reintroduce this failure.

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'grant select, insert, update, delete on table public.%I to anon, authenticated, service_role',
      t
    );
  end loop;
end $$;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
