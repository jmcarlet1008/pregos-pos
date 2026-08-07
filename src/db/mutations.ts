import type { SyncStatus } from './schema'

/**
 * Shared helpers for local write paths. Every feature module used to redefine its own
 * `timestamps()`/`touch()` — most of those copies only bumped `updated_at` and never
 * reset `sync_status` back to 'pending'. That's a real bug: once a row has synced once
 * (sync_status: 'synced'), any later edit that goes through one of those copies is
 * silently invisible to pushPending() (sync/push.ts only ever looks at rows with
 * sync_status: 'pending'), so the edit stays local-only forever — it looks saved, but
 * never leaves the device. This is exactly what happened to renamed/repriced menu
 * items and completed/voided orders that had already synced once before being edited
 * again. `touch`/`touchPatch` are the one place that invariant is enforced now.
 */

export function nowIso(): string {
  return new Date().toISOString()
}

export function timestamps(): { created_at: string; updated_at: string } {
  const now = nowIso()
  return { created_at: now, updated_at: now }
}

/** Re-saves a full entity after a local edit: bumps updated_at and always re-flags it pending. */
export function touch<T extends { updated_at: string; sync_status: SyncStatus }>(entity: T): T {
  return { ...entity, updated_at: nowIso(), sync_status: 'pending' }
}

/** Same as touch(), but for Dexie's partial-patch `.update(id, patch)` call shape. */
export function touchPatch<T extends Record<string, unknown>>(
  patch: T,
): T & { updated_at: string; sync_status: SyncStatus } {
  return { ...patch, updated_at: nowIso(), sync_status: 'pending' }
}
