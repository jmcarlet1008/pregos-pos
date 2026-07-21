import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, PinPad } from '../../components/ui'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { user, loginWithPin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/register'

  async function submit(requireRole?: 'manager') {
    if (pin.length !== 4 || submitting) return
    setSubmitting(true)
    setError(null)
    const result = await loginWithPin(pin, requireRole ? { requireRole } : undefined)
    setSubmitting(false)
    if (result.ok) {
      navigate(from, { replace: true })
    } else {
      setError(result.error)
      setPin('')
    }
  }

  function switchUser() {
    logout()
    setPin('')
    setError(null)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <div className="hidden w-[45%] flex-col justify-between border-r border-outline-variant bg-surface-container-low p-md md:flex">
        <div className="flex h-full flex-col items-center justify-center gap-md text-center">
          <span className="text-display-lg text-primary">Prego's Cucina</span>
          <span className="text-body-lg text-on-surface-variant">Pizza . Pasta . Chicken</span>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-center gap-8 p-md md:w-[55%]">
        <div className="flex w-full max-w-[448px] flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-headline-lg text-on-surface">Enter PIN</h1>
            <p className="text-body-md text-on-surface-variant">
              {user ? `Signed in as ${user.name}. Enter a PIN to switch.` : 'Please enter your 4-digit access code.'}
            </p>
            {error && <p className="text-label-bold text-error">{error}</p>}
          </div>

          <PinPad value={pin} onChange={setPin} onComplete={() => setError(null)} />

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={pin.length !== 4 || submitting}
            onClick={() => submit()}
            className="max-w-[320px]"
          >
            Clock In
          </Button>

          <div className="flex gap-md">
            <button
              type="button"
              onClick={switchUser}
              className="text-label-bold uppercase text-on-surface-variant transition-colors hover:text-primary"
            >
              Switch User
            </button>
            <span className="text-outline-variant">|</span>
            <button
              type="button"
              onClick={() => submit('manager')}
              disabled={pin.length !== 4 || submitting}
              className="text-label-bold uppercase text-on-surface-variant transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              Manager Login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
