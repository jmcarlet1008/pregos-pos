import { useEffect, useState } from 'react'
import { Button, Card, Input } from '../../components/ui'
import {
  connectDevice,
  disconnectDevice,
  getDeviceAuthStatus,
  onDeviceAuthChange,
  type DeviceAuthStatus,
} from '../../lib/deviceAuth'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

/**
 * One-time device pairing (Tier B of the PIN/RLS security fix) — separate from staff
 * PIN login. Connecting this iPad to the shared device account is what lets it read/
 * write `users`, `shifts`, `stock_adjustments`, and full order history once RLS is
 * scoped those tables to `authenticated` only; without it, this device syncs as
 * `anon` and those reads/writes will be denied. Session persists locally afterward —
 * this only needs to be done once per physical device, typically during setup.
 */
export function DeviceAuthSection() {
  const [status, setStatus] = useState<DeviceAuthStatus | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDeviceAuthStatus().then(setStatus)
    return onDeviceAuthChange(setStatus)
  }, [])

  async function handleConnect() {
    if (!email.trim() || !password || connecting) return
    setConnecting(true)
    setError(null)
    const result = await connectDevice(email.trim(), password)
    setConnecting(false)
    if (result.ok) {
      setPassword('')
    } else {
      setError(result.error)
    }
  }

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

      {isSupabaseConfigured && status && !status.connected && (
        <div className="flex flex-col gap-sm">
          <Input
            label="Device email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <Input
            label="Device password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && <p className="text-label-bold text-error">{error}</p>}
          <Button
            variant="primary"
            disabled={!email.trim() || !password || connecting}
            onClick={() => void handleConnect()}
            className="self-start"
          >
            {connecting ? 'Connecting…' : 'Connect This Device'}
          </Button>
        </div>
      )}
    </Card>
  )
}
