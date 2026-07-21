export type SyncEngineStatus = 'idle' | 'syncing' | 'error'

export interface SyncState {
  status: SyncEngineStatus
  lastError: string | null
  lastSyncedAt: string | null
}

let state: SyncState = { status: 'idle', lastError: null, lastSyncedAt: null }
const listeners = new Set<() => void>()

export function getSyncState(): SyncState {
  return state
}

export function setSyncState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function subscribeSyncState(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}
