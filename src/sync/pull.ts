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
 *
 * Every table is attempted regardless of earlier failures, and errors are collected
 * rather than thrown mid-loop — mirroring push.ts's pushPending. This matters
 * specifically because `users`/`shifts`/`stock_adjustments` are RLS-restricted to the
 * `authenticated` device session (see supabase/migrations/*_device_auth_rls.sql): a
 * device that hasn't connected yet (lib/deviceAuth.ts) will get a permission-denied
 * pulling those, and that must not also block categories/products/orders/payments/
 * businessSettings — which sit after `users` in SYNC_TABLES — from pulling. If
 * anything failed, the collected messages are thrown at the end so the sync engine
 * still surfaces status: 'error' with useful detail, same as before.
 */
export async function pullChanges(sinceIso: string | null): Promise<void> {
  const errors: string[] = []

  for (const config of SYNC_TABLES) {
    try {
      let query = supabase.from(config.remote).select('*')
      if (sinceIso) query = query.gt('updated_at', sinceIso)
      const { data, error } = await query
      if (error) throw new Error(`Pull failed for ${config.name}: ${error.message}`)
      if (!data || data.length === 0) continue

      for (const remoteRow of data) {
        const localRow = await config.local.get(remoteRow.id)
        if (localRow && (localRow.sync_status === 'pending' || localRow.sync_status === 'conflict')) {
          continue
        }
        await config.local.put({ ...remoteRow, sync_status: 'synced' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Sync pull failed for ${config.name}`, err)
      errors.push(message)
    }
  }

  if (errors.length > 0) throw new Error(errors.join('; '))
}
