import { useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { forceResync } from '../../sync/syncEngine'
import { useSyncStatus } from '../../sync/useSyncStatus'

/**
 * Recovery tool for a device whose sales/orders quietly never reached the cloud
 * despite the top bar showing "Synced" — see the 2026-08-20 incident notes in
 * supabase/migrations/20260815000000_order_number_uniqueness.sql. Re-queues every
 * locally "synced" row on this device for a fresh push. Safe to run any time: it goes
 * through the same conflict-aware/last-write-wins comparison as normal sync, so it
 * can't overwrite data that's actually correct — it only recovers rows that were
 * wrongly marked synced without ever reaching Supabase.
 */
export function ForceResyncSection() {
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [ran, setRan] = useState(false)
  const status = useSyncStatus()

  async function handleConfirm() {
    setConfirming(false)
    setRunning(true)
    setRan(false)
    try {
      await forceResync()
    } finally {
      setRunning(false)
      setRan(true)
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Force Resync</h2>
      <p className="text-body-md text-on-surface-variant">
        Re-sends every order, sale, and change on <strong>this device</strong> to the cloud, even ones
        already marked "Synced" — recovers a device whose data quietly never made it up. Only use this if a
        manager suspects this device's sales aren't showing up on other stations or in Analytics.
      </p>

      {!isSupabaseConfigured && (
        <div className="rounded-md border border-outline bg-surface-container px-sm py-xs text-body-md text-on-surface-variant">
          Cloud sync isn’t configured on this device.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-sm">
        <Button
          variant="secondary"
          disabled={running || !isSupabaseConfigured}
          onClick={() => setConfirming(true)}
        >
          {running ? 'Resyncing…' : 'Force Resync This Device'}
        </Button>
        <span className="text-body-md text-on-surface-variant">{status.label}</span>
      </div>

      {ran && !running && (
        <p className="text-body-md text-on-surface-variant">
          Done —{' '}
          {status.pendingCount > 0
            ? `${status.pendingCount} still pending, will keep retrying automatically.`
            : 'everything on this device pushed successfully.'}
        </p>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Force Resync This Device?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleConfirm()}>
              Resync Now
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">
          This re-checks every order, sale, and change stored on this device against the cloud and pushes
          anything that's out of sync. It won't overwrite anything that's already correct elsewhere, and
          it's safe to run more than once. Continue?
        </p>
      </Modal>
    </Card>
  )
}
