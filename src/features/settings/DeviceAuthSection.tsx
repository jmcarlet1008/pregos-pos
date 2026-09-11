import { useEffect, useState } from 'react'
import { Button, Card } from '../../components/ui'
import { DeviceConnectForm } from '../auth/DeviceConnectForm'
import { disconnectDevice, getDeviceAuthStatus, onDeviceAuthChange, type DeviceAuthStatus } from '../../lib/deviceAuth'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

/**
 * One-time device pairing (Tier B of the PIN/RLS security fix) — separate from staff
 * PIN login. Connecting this iPad to the shared device account is what lets it read/
 * write `users`, `shifts`, `stock_adjustments`, and full order history once RLS is
 * scoped those tables to `authenticated` only; without it, this device syncs as
 * `anon` and those reads/writes will be denied. Session persists locally afterward —
 * this only needs to be done once per physical device, typically during setup.
 *
 * A device usually never reaches this screen not-connected — see DeviceSetupScreen.tsx,
 * which handles that case pre-login. This section exists for checking status and
 * reconnecting (e.g. after a Disconnect, or a session that somehow expired).
 */
export function DeviceAuthSection() {
  const [status, setStatus] = useState<DeviceAuthStatus | null>(null)

  useEffect(() => {
    getDeviceAuthStatus().then(setStatus)
    return onDeviceAuthChange(setStatus)
  }, [])

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Device Connection</h2>
      <p className="text-body-md text-on-surface-variant">
        Connects <strong>this device</strong> to the restaurant's staff account, separate from PIN login.
        Required once per iPad — until it's connected, this device can't sync staff, shifts, stock
        adjustments, or full order history.
      </p>

      {!isSupabaseConfigured && (
        <div className="rounded-md border border-outline bg-surface-container px-sm py-xs text-body-md text-on-surface-variant">
          Cloud sync isn’t configured on this device.
        </div>
      )}

      {isSupabaseConfigured && status?.connected && (
        <div className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-outline bg-surface-container px-sm py-xs">
          <span className="text-body-md text-on-surface">
            Connected as <strong>{status.email}</strong>
          </span>
          <Button variant="secondary" onClick={() => void disconnectDevice()}>
            Disconnect
          </Button>
        </div>
      )}

      {isSupabaseConfigured && status && !status.connected && <DeviceConnectForm />}
    </Card>
  )
}
