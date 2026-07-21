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

async function pushConflictAware(config: SyncTableConfig, pendingRows: any[], lastSyncedAt: string | null) {
  const remoteById = await fetchRemoteByIds(config.remote, pendingRows.map((r) => r.id))

  for (const row of pendingRows) {
    const payload = stripSyncStatus(row)
    const remote = remoteById.get(row.id)

    const remoteChangedSinceLastSync = Boolean(remote) && (!lastSyncedAt || remote.updated_at > lastSyncedAt)
    const isConflict = remoteChangedSinceLastSync && contentDiffers(remote, payload)

    if (isConflict) {
      const { error: conflictError } = await supabase.from('sync_conflicts').insert({
        entity_type: config.name,
        entity_id: row.id,
        local_data: payload,
        remote_data: remote,
      })
      if (conflictError) throw new Error(`Failed to log conflict for ${config.name}: ${conflictError.message}`)
      await config.local.update(row.id, { sync_status: 'conflict' })
      continue
    }

    const { error } = await supabase.from(config.remote).upsert(payload)
    if (error) throw new Error(`Push failed for ${config.name}: ${error.message}`)
    await config.local.update(row.id, { sync_status: 'synced' })
  }
}

async function pushLastWriteWins(config: SyncTableConfig, pendingRows: any[]) {
  const remoteById = await fetchRemoteByIds(config.remote, pendingRows.map((r) => r.id))

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

  if (toUpsert.length === 0) return
  const { error } = await supabase.from(config.remote).upsert(toUpsert)
  if (error) throw new Error(`Push failed for ${config.name}: ${error.message}`)
  await Promise.all(toUpsert.map((r) => config.local.update(r.id, { sync_status: 'synced' })))
}

/** Pushes every table's sync_status='pending' rows, in dependency order. */
export async function pushPending(lastSyncedAt: string | null): Promise<void> {
  for (const config of SYNC_TABLES) {
    const pendingRows = await config.local.where('sync_status').equals('pending').toArray()
    if (pendingRows.length === 0) continue

    if (config.conflictAware) {
      await pushConflictAware(config, pendingRows, lastSyncedAt)
    } else {
      await pushLastWriteWins(config, pendingRows)
    }
  }
}
