import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar, TopBar } from '../components/ui'
import { useAuth } from '../features/auth/AuthContext'
import { ROUTES } from '../routes'

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
        <main className="min-h-0 flex-1 overflow-auto p-md">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
