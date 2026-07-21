import { useRef, useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import { exportBackup, parseBackupFile, restoreBackup, type BackupFile } from './backupData'

export function BackupRestoreSection() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [pendingBackup, setPendingBackup] = useState<{ file: BackupFile; name: string } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportBackup()
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export backup.')
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
      const backup = parseBackupFile(text)
      setPendingBackup({ file: backup, name: file.name })
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  async function handleConfirmRestore() {
    if (!pendingBackup) return
    setRestoring(true)
    try {
      await restoreBackup(pendingBackup.file)
      setPendingBackup(null)
      setRestored(true)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not restore backup.')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Backup &amp; Restore</h2>
      <p className="text-body-md text-on-surface-variant">
        Saves everything on this device — products, categories, orders, users, and stock history — to a single file.
        Cloud backup is coming in a later update.
      </p>

      <div className="flex flex-wrap items-center gap-sm">
        <Button variant="secondary" disabled={exporting} onClick={handleExport}>
          {exporting ? 'Exporting…' : 'Export Backup'}
        </Button>

        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChosen} />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          Restore from Backup
        </Button>
      </div>

      {exportError && <p className="text-body-md text-error">{exportError}</p>}
      {restored && (
        <div className="flex items-center gap-sm rounded-md border border-surface-dim bg-surface-container px-sm py-xs">
          <p className="flex-1 text-body-md text-on-surface-variant">Backup restored. Reload to refresh the whole app.</p>
          <Button variant="primary" size="md" onClick={() => window.location.reload()}>
            Reload Now
          </Button>
        </div>
      )}

      <Modal
        open={pendingBackup !== null}
        onClose={() => setPendingBackup(null)}
        title="Restore from Backup"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingBackup(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={restoring} onClick={handleConfirmRestore}>
              {restoring ? 'Restoring…' : 'Overwrite & Restore'}
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">
          This replaces <strong>all</strong> current data — products, orders, users, stock history, everything — with
          the contents of <strong>{pendingBackup?.name}</strong>. This can't be undone. Continue?
        </p>
      </Modal>

      <Modal
        open={parseError !== null}
        onClose={() => setParseError(null)}
        title="Can’t Restore Backup"
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
