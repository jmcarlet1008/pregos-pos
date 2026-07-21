import { db, SYNC_META_ID } from '../../db'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { pullChanges } from '../../sync/pull'
import { SYNC_TABLES } from '../../sync/tables'

const BACKUP_APP_ID = 'pregos-pos-cloud'
const BACKUP_VERSION = 1

export interface CloudBackupFile {
  app: string
  backupVersion: number
  exportedAt: string
  tables: Record<string, unknown[]>
}

/** Downloads a single timestamped JSON file containing every Supabase table's rows. */
export async function exportCloudBackup(): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud sync isn’t configured — add Supabase credentials first.')

  const tables: Record<string, unknown[]> = {}
  for (const config of SYNC_TABLES) {
    const { data, error } = await supabase.from(config.remote).select('*')
    if (error) throw new Error(`Could not read ${config.remote} from the cloud: ${error.message}`)
    tables[config.remote] = data ?? []
  }

  const payload: CloudBackupFile = {
    app: BACKUP_APP_ID,
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = payload.exportedAt.replace(/[:.]/g, '-')

  const link = document.createElement('a')
  link.href = url
  link.download = `pregos-pos-cloud-backup_${stamp}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Parses and shape-checks a cloud backup file's raw text. Throws a user-facing message if invalid. */
export function parseCloudBackupFile(raw: string): CloudBackupFile {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('That file isn’t valid JSON.')
  }
  if (
    !data ||
    typeof data !== 'object' ||
    (data as CloudBackupFile).app !== BACKUP_APP_ID ||
    typeof (data as CloudBackupFile).tables !== 'object' ||
    (data as CloudBackupFile).tables === null
  ) {
    throw new Error('That file doesn’t look like a Prego’s POS cloud backup.')
  }
  return data as CloudBackupFile
}

/**
 * Wipes every Supabase table and repopulates it from the backup, then pulls the
 * restored data back down into this device's local copy so Register/Menu/etc.
 * reflect it immediately without waiting for the next scheduled sync.
 */
export async function restoreCloudBackup(backup: CloudBackupFile): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Cloud sync isn’t configured — add Supabase credentials first.')

  // Reverse dependency order for delete, forward order for insert.
  for (const config of [...SYNC_TABLES].reverse()) {
    const { error } = await supabase.from(config.remote).delete().not('id', 'is', null)
    if (error) throw new Error(`Could not clear ${config.remote}: ${error.message}`)
  }

  for (const config of SYNC_TABLES) {
    const rows = backup.tables[config.remote]
    if (!Array.isArray(rows) || rows.length === 0) continue
    const { error } = await supabase.from(config.remote).insert(rows)
    if (error) throw new Error(`Could not restore ${config.remote}: ${error.message}`)
  }

  // Force a full re-pull: reset the cursor so pullChanges treats everything as new.
  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: null })
  await pullChanges(null)
  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: new Date().toISOString() })
}
