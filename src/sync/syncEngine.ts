import { db, SYNC_META_ID } from '../db'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { processPendingImageUploads } from './imageSync'
import { pullChanges } from './pull'
import { pushPending } from './push'
import { setSyncState } from './syncStore'
import { SYNC_TABLES } from './tables'

const SYNC_INTERVAL_MS = 30_000

let cycleInFlight: Promise<void> | null = null
let rerunRequested = false

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

/**
 * Runs a pull+push cycle. A call made while one is already in flight doesn't start a
 * second concurrent cycle, but it does queue exactly one more right after: the in-flight
 * cycle may already be past the step that would have picked up whatever the caller just
 * wrote (e.g. Register's post-payment nudge landing mid-cycle, after `orders` was pushed),
 * which would otherwise leave that walk-in waiting for the next 30s tick before /kitchen
 * could see it. Every caller during one in-flight cycle shares that single rerun.
 *
 * The periodic timer passes `rerunIfBusy: false` — it just joins: a slow catch-up cycle
 * (a big backlog taking longer than the 30s interval) must not chain into back-to-back
 * reruns forever.
 */
export function runSyncCycle({ rerunIfBusy = true }: { rerunIfBusy?: boolean } = {}): Promise<void> {
  if (cycleInFlight) {
    if (rerunIfBusy) rerunRequested = true
    return cycleInFlight
  }
  cycleInFlight = (async () => {
    do {
      rerunRequested = false
      await runCycleUnguarded()
    } while (rerunRequested)
  })().finally(() => {
    cycleInFlight = null
  })
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
  // One modify() per table (a single IndexedDB transaction) rather than one concurrent
  // update() per row — thousands of simultaneous transactions broke iPad Safari's
  // IndexedDB on 2026-10-24 (see markSynced in push.ts).
  for (const config of SYNC_TABLES) {
    await config.local.where('sync_status').equals('synced').modify({ sync_status: 'pending' })
  }
  await runSyncCycle()
}

/** Starts the recurring sync engine: on load, every 30s while online, and on the 'online' event. */
export function startSyncEngine(): () => void {
  void runSyncCycle()

  const interval = setInterval(() => {
    void runSyncCycle({ rerunIfBusy: false })
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
