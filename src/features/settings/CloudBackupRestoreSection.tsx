import { useRef, useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import {
  exportCloudBackup,
  parseCloudBackupFile,
  restoreCloudBackup,
  type CloudBackupFile,
} from './cloudBackupData'

/** Manager-only backup/restore against the Supabase cloud copy (separate from the local-device backup above). */
export function CloudBackupRestoreSection() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [pendingBackup, setPendingBackup] = useState<{ file: CloudBackupFile; name: string } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportCloudBackup()
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export cloud backup.')
    } finally {
      setExporting(false)
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setParseError(null)
    try {
      const text = await file.text()
      const backup = parseCloudBackupFile(text)
      setPendingBackup({ file: backup, name: file.name })
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  async function handleConfirmRestore() {
    if (!pendingBackup) return
    setRestoring(true)
    try {
      await restoreCloudBackup(pendingBackup.file)
      setPendingBackup(null)
      setRestored(true)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not restore cloud backup.')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Cloud Backup &amp; Restore</h2>
      <p className="text-body-md text-on-surface-variant">
        Backs up or restores the Supabase copy directly — every station's data, not just this device. Manager access
        only.
      </p>

      {!isSupabaseConfigured && (
        <div className="rounded-md border border-outline bg-surface-container px-sm py-xs text-body-md text-on-surface-variant">
          Cloud sync isn’t configured on this device yet. Add VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to enable
          cloud backup.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-sm">
        <Button variant="secondary" disabled={exporting || !isSupabaseConfigured} onClick={handleExport}>
          {exporting ? 'Exporting…' : 'Export Cloud Backup'}
        </Button>

        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChosen} />
        <Button
          variant="secondary"
          disabled={!isSupabaseConfigured}
          onClick={() => fileInputRef.current?.click()}
        >
          Restore Cloud from Backup
        </Button>
      </div>

      {exportError && <p className="text-body-md text-error">{exportError}</p>}
      {restored && (
        <div className="flex items-center gap-sm rounded-md border border-surface-dim bg-surface-container px-sm py-xs">
          <p className="flex-1 text-body-md text-on-surface-variant">
            Cloud data restored and pulled down to this device. Reload to refresh the whole app.
          </p>
          <Button variant="primary" size="md" onClick={() => window.location.reload()}>
            Reload Now
          </Button>
        </div>
      )}

      <Modal
        open={pendingBackup !== null}
        onClose={() => setPendingBackup(null)}
        title="Restore Cloud from Backup"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingBackup(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={restoring} onClick={handleConfirmRestore}>
              {restoring ? 'Restoring…' : 'Overwrite Cloud & Restore'}
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">
          This replaces <strong>all</strong> data in the Supabase cloud copy — every station's products, orders,
          users, and stock history — with the contents of <strong>{pendingBackup?.name}</strong>, then pulls it down
          to this device. Other stations will pick it up on their next sync. This can't be undone. Continue?
        </p>
      </Modal>

      <Modal
        open={parseError !== null}
        onClose={() => setParseError(null)}
        title="Can’t Restore Cloud Backup"
        footer={
          <Button variant="primary" onClick={() => setParseError(null)}>
            OK
          </Button>
        }
      >
        <p className="text-body-md text-on-surface">{parseError}</p>
      </Modal>
    </Card>
  )
}
