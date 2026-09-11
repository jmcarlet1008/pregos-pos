/**
 * PIN hashing for staff login (see AuthContext.loginWithPin / features/settings/usersData.ts).
 *
 * Unsalted SHA-256, deliberately. With only 10,000 possible 4-digit PINs, a salt buys
 * no real protection against anyone who already has the hash — the whole keyspace is
 * precomputable in milliseconds regardless of salting. What hashing here actually buys
 * is: no raw PIN sitting in DevTools/IndexedDB, network responses, or a Supabase
 * export/backup. Unsalted also keeps `loginWithPin` a plain indexed Dexie lookup
 * (`db.users.where({ pin_hash })`), which is what makes zero-network offline login
 * practical — a per-user salt would force either a full-table scan-and-compare or a
 * two-step lookup instead. `usersData.ts` already enforces global PIN uniqueness across
 * active *and* inactive users, so an unsalted hash collision carries no extra
 * information anyway.
 *
 * The Postgres side (see supabase/migrations/*_add_pin_hash.sql) computes the same
 * value via `encode(digest(pin, 'sha256'), 'hex')` (pgcrypto) — PINs are validated as
 * `^\d{4}$` (pure ASCII digits) before ever reaching either side, so the two are
 * byte-for-byte equivalent.
 */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
