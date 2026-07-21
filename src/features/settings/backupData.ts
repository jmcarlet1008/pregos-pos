import { db } from '../../db'

const BACKUP_APP_ID = 'pregos-pos'
const BACKUP_VERSION = 1

export interface BackupFile {
  app: string
  backupVersion: number
  exportedAt: string
  tables: Record<string, unknown[]>
}

/** Downloads a single timestamped JSON file containing every Dexie table's rows. */
export async function exportBackup(): Promise<void> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }

  const payload: BackupFile = {
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
  link.download = `pregos-pos-backup_${stamp}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Parses and shape-checks a backup file's raw text. Throws a user-facing message if invalid. */
export function parseBackupFile(raw: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('That file isn’t valid JSON.')
  }
  if (
    !data ||
    typeof data !== 'object' ||
    (data as BackupFile).app !== BACKUP_APP_ID ||
    typeof (data as BackupFile).tables !== 'object' ||
    (data as BackupFile).tables === null
  ) {
    throw new Error('That file doesn’t look like a Prego’s POS backup.')
  }
  return data as BackupFile
}

/** Wipes every Dexie table and repopulates it from the backup. Not undoable. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear()
      const rows = backup.tables[table.name]
      if (Array.isArray(rows) && rows.length > 0) {
        await table.bulkAdd(rows)
      }
    }
  })
}
