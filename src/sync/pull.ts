import { supabase } from '../lib/supabaseClient'
import { SYNC_TABLES } from './tables'

/**
 * Pulls every remote row changed since `sinceIso` (or the whole table on first
 * sync, when sinceIso is null) and merges it into the matching Dexie table.
 *
 * A local row with sync_status 'pending' or 'conflict' is left untouched here —
 * pending rows are reconciled by the push phase (which fetches the same remote
 * row itself to decide push-vs-conflict-vs-remote-wins), and conflict rows stay
 * frozen until a manager resolves them, so a pull never silently clobbers either.
 */
export async function pullChanges(sinceIso: string | null): Promise<void> {
  for (const config of SYNC_TABLES) {
    let query = supabase.from(config.remote).select('*')
    if (sinceIso) query = query.gt('updated_at', sinceIso)
    const { data, error } = await query
    if (error) {
      throw new Error(`Pull failed for ${config.name}: ${error.message}`)
    }
    if (!data || data.length === 0) continue

    for (const remoteRow of data) {
      const localRow = await config.local.get(remoteRow.id)
      if (localRow && (localRow.sync_status === 'pending' || localRow.sync_status === 'conflict')) {
        continue
      }
      await config.local.put({ ...remoteRow, sync_status: 'synced' })
    }
  }
}
