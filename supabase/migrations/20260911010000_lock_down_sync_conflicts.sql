-- Tier A.2 (RLS tightening, safe today): sync_conflicts is only ever inserted into —
-- by sync/push.ts's conflict logging — and never selected/updated/deleted by any code
-- path in the app (conflict resolution today happens via the Supabase dashboard
-- directly). Unlike every other table, no route (public or iPad-only) needs anon read
-- access to it, so this is the one table that can be locked down independently of the
-- device-auth work in Tier B.

revoke select, update, delete on sync_conflicts from anon;
drop policy if exists anon_full_access on sync_conflicts;
create policy anon_insert_only on sync_conflicts for insert to anon with check (true);
