import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { Sidebar, TopBar } from '../components/ui'
import { useAuth } from '../features/auth/AuthContext'
import { getDeviceAuthStatus, onDeviceAuthChange, type DeviceAuthStatus } from '../lib/deviceAuth'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { ROUTES } from '../routes'

/**
 * LoginPage blocks a not-connected device up front (DeviceSetupScreen), but a device
 * session can also drop in the middle of a shift (expired/revoked refresh token) while
 * staff stay PIN-logged-in. Register keeps working locally then, but every push runs as
 * anon and is rejected — walk-ins silently never reach /kitchen or /fulfillment (seen in
 * prod 2026-10-24 and reproduced locally 2026-11-12). This makes that state impossible
 * to miss on every staff screen instead of only a small "Sync error" label.
 */
function DeviceDisconnectedBanner() {
  const [status, setStatus] = useState<DeviceAuthStatus | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void getDeviceAuthStatus().then(setStatus)
    return onDeviceAuthChange(setStatus)
  }, [])

  if (!status || status.connected) return null
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-sm bg-error px-md py-sm text-on-error">
      <span className="text-body-md font-bold">
        ⚠️ This device is not connected — new orders are saved here but will NOT reach the kitchen or fulfillment
        screens until a manager reconnects it.
      </span>
      <Link to={ROUTES.settings} className="touch-target flex items-center rounded-md bg-on-error px-md text-label-bold text-error">
        Reconnect in Settings
      </Link>
    </div>
  )
}

const SIDEBAR_OPEN_KEY = 'pregos-pos:sidebar-open'

function getInitialSidebarOpen(): boolean {
  const stored = localStorage.getItem(SIDEBAR_OPEN_KEY)
  if (stored !== null) return stored === 'true'
  return window.innerWidth >= 1280
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(next))
      return next
    })
  }

  function handleLogout() {
    logout()
    navigate(ROUTES.login, { replace: true })
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userName={user ? `${user.name} (${user.role})` : undefined}
          onLogout={handleLogout}
          onToggleSidebar={toggleSidebar}
        />
        <DeviceDisconnectedBanner />
        <main className="min-h-0 flex-1 overflow-auto p-md">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
