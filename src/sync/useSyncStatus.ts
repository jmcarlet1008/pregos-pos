import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { SYNC_TABLES } from './tables'
import { getSyncState, subscribeSyncState } from './syncStore'

async function countPending(): Promise<number> {
  const counts = await Promise.all(SYNC_TABLES.map((config) => config.local.where('sync_status').equals('pending').count()))
  return counts.reduce((sum, n) => sum + n, 0)
}

export interface SyncStatusInfo {
  online: boolean
  configured: boolean
  status: 'idle' | 'syncing' | 'error'
  lastError: string | null
  lastSyncedAt: string | null
  pendingCount: number
  label: string
}

export function useSyncStatus(): SyncStatusInfo {
  const online = useOnlineStatus()
  const engine = useSyncExternalStore(subscribeSyncState, getSyncState)
  const pendingCount = useLiveQuery(countPending, [], 0) ?? 0

  let label: string
  if (!isSupabaseConfigured) {
    label = 'Cloud sync not configured'
  } else if (!online) {
    label = pendingCount > 0 ? `Offline — ${pendingCount} pending` : 'Offline'
  } else if (engine.status === 'syncing') {
    label = 'Syncing…'
  } else if (engine.status === 'error') {
    label = pendingCount > 0 ? `Sync error — ${pendingCount} pending` : 'Sync error'
  } else if (pendingCount > 0) {
    label = `${pendingCount} pending`
  } else {
    label = 'Synced'
  }

  return {
    online,
    configured: isSupabaseConfigured,
    status: engine.status,
    lastError: engine.lastError,
    lastSyncedAt: engine.lastSyncedAt,
    pendingCount,
    label,
  }
}
