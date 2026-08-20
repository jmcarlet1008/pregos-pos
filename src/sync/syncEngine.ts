import { db, SYNC_META_ID } from '../db'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { processPendingImageUploads } from './imageSync'
import { pullChanges } from './pull'
import { pushPending } from './push'
import { setSyncState } from './syncStore'
import { SYNC_TABLES } from './tables'

const SYNC_INTERVAL_MS = 30_000

let cycleInFlight: Promise<void> | null = null

async function runCycleUnguarded(): Promise<void> {
  if (!isSupabaseConfigured || !navigator.onLine) return

  setSyncState({ status: 'syncing' })
  try {
    const meta = await db.syncMeta.get(SYNC_META_ID)
    const lastSyncedAt = meta?.last_synced_at ?? null
    const cycleStartedAt = new Date().toISOString()

    await pullChanges(lastSyncedAt)
    await processPendingImageUploads()
    await pushPending(lastSyncedAt)

    await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: cycleStartedAt })
    setSyncState({ status: 'idle', lastError: null, lastSyncedAt: cycleStartedAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Sync cycle failed', err)
    setSyncState({ status: 'error', lastError: message })
  }
}

/** Runs a pull+push cycle, coalescing overlapping calls into the in-flight one. */
export function runSyncCycle(): Promise<void> {
  if (!cycleInFlight) {
    cycleInFlight = runCycleUnguarded().finally(() => {
      cycleInFlight = null
    })
  }
  return cycleInFlight
}

/**
 * Recovery action for a device whose data quietly never made it to the cloud despite
 * locally showing "Synced" — see supabase/migrations/20260815000000_order_number_
 * uniqueness.sql for the 2026-08-20 incident this was built for (root cause not fully
 * pinned down; this is the mitigation). Re-marks every locally sync_status='synced'
 * row as 'pending' so the next push cycle re-sends it. Safe to run repeatedly: push
 * still runs every row through its normal conflict-aware/last-write-wins comparison
 * against the current remote row, so this can never blindly overwrite data that's
 * actually correct elsewhere — it only recovers rows that were wrongly marked synced.
 * Rows already 'pending' or frozen at 'conflict' are left untouched (a 'conflict' row
 * needs a manager's explicit resolution, not a silent re-push of the same disagreement).
 */
export async function forceResync(): Promise<void> {
  for (const config of SYNC_TABLES) {
    const rows = await config.local.where('sync_status').equals('synced').toArray()
    await Promise.all(rows.map((r) => config.local.update(r.id, { sync_status: 'pending' })))
  }
  await runSyncCycle()
}

/** Starts the recurring sync engine: on load, every 30s while online, and on the 'online' event. */
export function startSyncEngine(): () => void {
  void runSyncCycle()

  const interval = setInterval(() => {
    void runSyncCycle()
  }, SYNC_INTERVAL_MS)

  function onOnline() {
    void runSyncCycle()
  }
  window.addEventListener('online', onOnline)

  return () => {
    clearInterval(interval)
    window.removeEventListener('online', onOnline)
  }
}
