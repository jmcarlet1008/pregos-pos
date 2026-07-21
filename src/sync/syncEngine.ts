import { db, SYNC_META_ID } from '../db'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { processPendingImageUploads } from './imageSync'
import { pullChanges } from './pull'
import { pushPending } from './push'
import { setSyncState } from './syncStore'

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
