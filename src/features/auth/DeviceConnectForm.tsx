import { useState } from 'react'
import { Button, Input } from '../../components/ui'
import { connectDevice } from '../../lib/deviceAuth'

/**
 * The email/password/connect-button form shared between the pre-login device setup
 * screen (DeviceSetupScreen.tsx, shown on a never-connected device) and the Settings ->
 * Device Connection section (DeviceAuthSection.tsx, for reconnecting/checking status
 * post-login). See lib/deviceAuth.ts for what "connecting" actually does.
 */
export function DeviceConnectForm({ onConnected }: { onConnected?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    if (!email.trim() || !password || connecting) return
    setConnecting(true)
    setError(null)
    const result = await connectDevice(email.trim(), password)
    setConnecting(false)
    if (result.ok) {
      setPassword('')
      onConnected?.()
    } else {
      setError(result.error)
    }
  }

  return (
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleConnect()
        }}
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
  )
}
