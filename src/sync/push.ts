import { db } from '../db'
import { supabase } from '../lib/supabaseClient'
import { SYNC_TABLES, stripSyncStatus, type SyncTableConfig } from './tables'

/** Ignores id/timestamps when deciding whether two versions of a row actually disagree. */
function contentDiffers(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const strip = ({ id: _id, created_at: _c, updated_at: _u, ...rest }: Record<string, unknown>) => rest
  return JSON.stringify(strip(a)) !== JSON.stringify(strip(b))
}

async function fetchRemoteByIds(remote: string, ids: string[]): Promise<Map<string, any>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from(remote).select('*').in('id', ids)
  if (error) throw new Error(`Fetch failed for ${remote}: ${error.message}`)
  return new Map((data ?? []).map((row: any) => [row.id, row]))
}

/** Postgres unique_violation SQLSTATE — see orders_order_number_unique_idx. */
function isOrderNumberCollision(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error) && error!.code === '23505' && (error!.message ?? '').includes('order_number')
}

/**
 * order_number is assigned client-side as "local max + 1" (see getNextOrderNumber in
 * registerData.ts) with no server-side coordination — a genuine race between devices.
 * The unique index on orders.order_number (2026-08-15 migration) turns a collision into
 * a loud upsert error instead of silently duplicating a number, but that alone just
 * trades "silent data loss" for "this order — and, before this fix, everything queued
 * behind it — is now permanently stuck." This renumbers past both the local and remote
 * max and retries once, so a collision self-heals on the next sync cycle instead of
 * requiring manual DB surgery.
 */
async function retryWithFreshOrderNumber(row: any): Promise<any> {
  const [localMax, remoteMax] = await Promise.all([
    db.orders.orderBy('order_number').last(),
    supabase.from('orders').select('order_number').order('order_number', { ascending: false }).limit(1),
  ])
  if (remoteMax.error) throw new Error(`Failed to read remote max order_number: ${remoteMax.error.message}`)
  const nextNumber = Math.max(localMax?.order_number ?? 0, remoteMax.data?.[0]?.order_number ?? 0) + 1
  await db.orders.update(row.id, { order_number: nextNumber })
  return { ...row, order_number: nextNumber }
}

/**
 * Pushes one table's pending rows. Each row is isolated in its own try/catch: a bad row
 * (conflict-log failure, or any other upsert error) is recorded and skipped rather than
 * aborting the rest of the table — a single stuck order must never block every other
 * pending row on this device from reaching the cloud.
 */
async function pushConflictAware(
  config: SyncTableConfig,
  pendingRows: any[],
  lastSyncedAt: string | null,
): Promise<string[]> {
  const remoteById = await fetchRemoteByIds(config.remote, pendingRows.map((r) => r.id))
  const errors: string[] = []

  for (let row of pendingRows) {
    try {
      const remote = remoteById.get(row.id)
      const remoteChangedSinceLastSync = Boolean(remote) && (!lastSyncedAt || remote.updated_at > lastSyncedAt)
      const isConflict = remoteChangedSinceLastSync && contentDiffers(remote, stripSyncStatus(row))

      if (isConflict) {
        const { error: conflictError } = await supabase.from('sync_conflicts').insert({
          entity_type: config.name,
          entity_id: row.id,
          local_data: stripSyncStatus(row),
          remote_data: remote,
        })
        if (conflictError) throw new Error(`Failed to log conflict for ${config.name}: ${conflictError.message}`)
        await config.local.update(row.id, { sync_status: 'conflict' })
        continue
      }

      let { error } = await supabase.from(config.remote).upsert(stripSyncStatus(row))
      if (error && config.name === 'orders' && isOrderNumberCollision(error)) {
        row = await retryWithFreshOrderNumber(row)
        ;({ error } = await supabase.from(config.remote).upsert(stripSyncStatus(row)))
      }
      if (error) throw new Error(`Push failed for ${config.name}: ${error.message}`)
      await config.local.update(row.id, { sync_status: 'synced' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Sync push failed for ${config.name} row ${row.id}`, err)
      errors.push(message)
    }
  }

  return errors
}

async function pushLastWriteWins(config: SyncTableConfig, pendingRows: any[]): Promise<string[]> {
  const remoteById = await fetchRemoteByIds(config.remote, pendingRows.map((r) => r.id))
  const errors: string[] = []

  const toUpsert: any[] = []
  for (const row of pendingRows) {
    const remote = remoteById.get(row.id)
    if (remote && remote.updated_at > row.updated_at) {
      // Remote is newer — it wins. Pull it down and drop the local pending edit.
      await config.local.put({ ...remote, sync_status: 'synced' })
    } else {
      toUpsert.push(stripSyncStatus(row))
    }
  }

  if (toUpsert.length === 0) return errors

  const { error } = await supabase.from(config.remote).upsert(toUpsert)
  if (!error) {
    await Promise.all(toUpsert.map((r) => config.local.update(r.id, { sync_status: 'synced' })))
    return errors
  }

  // Batch upsert failed — fall back to one row at a time so a single bad row (e.g. one
  // referencing a parent that hasn't landed yet) doesn't block all of its siblings.
  for (const row of toUpsert) {
    const { error: rowError } = await supabase.from(config.remote).upsert(row)
    if (rowError) {
      console.error(`Sync push failed for ${config.name} row ${row.id}`, rowError)
      errors.push(`Push failed for ${config.name}: ${rowError.message}`)
      continue
    }
    await config.local.update(row.id, { sync_status: 'synced' })
  }
  return errors
}

/**
 * Pushes every table's sync_status='pending' rows, in dependency order. Every table is
 * attempted regardless of earlier failures, and errors are collected rather than thrown
 * mid-loop — one table's (or one row's) problem must never prevent every other table
 * from syncing. If anything failed, the collected messages are thrown at the end so the
 * sync engine still surfaces status: 'error' with useful detail.
 */
export async function pushPending(lastSyncedAt: string | null): Promise<void> {
  const errors: string[] = []
  for (const config of SYNC_TABLES) {
    const pendingRows = await config.local.where('sync_status').equals('pending').toArray()
    if (pendingRows.length === 0) continue

    const tableErrors = config.conflictAware
      ? await pushConflictAware(config, pendingRows, lastSyncedAt)
      : await pushLastWriteWins(config, pendingRows)
    errors.push(...tableErrors)
  }

  if (errors.length > 0) throw new Error(errors.join('; '))
}
