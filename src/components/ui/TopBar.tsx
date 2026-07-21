import { useEffect, useState } from 'react'
import { MenuIcon, WifiIcon, WifiOffIcon } from './icons'

export interface TopBarProps {
  stationName?: string
  userName?: string
  onLogout?: () => void
  onToggleSidebar?: () => void
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    function goOnline() {
      setOnline(true)
    }
    function goOffline() {
      setOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

export function TopBar({
  stationName = 'Front Counter',
  userName = 'Not signed in',
  onLogout,
  onToggleSidebar,
}: TopBarProps) {
  const now = useClock()
  const online = useOnlineStatus()
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  return (
    <header className="flex min-h-touch items-center justify-between border-b border-surface-dim bg-surface-container-lowest px-md py-sm">
      <div className="flex items-center gap-sm">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            className="touch-target -ml-2 flex shrink-0 items-center justify-center rounded-full text-on-surface hover:bg-surface-container"
          >
            <MenuIcon width={22} height={22} />
          </button>
        )}
        <span className="text-label-bold text-on-surface">{stationName}</span>
      </div>

      <div className="flex items-center gap-md">
        <div
          className={[
            'flex items-center gap-xs text-label-bold',
            online ? 'text-on-surface-variant' : 'text-error',
          ].join(' ')}
        >
          {online ? <WifiIcon width={18} height={18} /> : <WifiOffIcon width={18} height={18} />}
          <span>{online ? 'Online' : 'Offline'}</span>
        </div>

        <span className="text-body-md tabular-nums text-on-surface">{time}</span>

        <span className="rounded-full bg-surface-container px-sm py-xs text-label-bold text-on-surface">
          {userName}
        </span>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="text-label-bold uppercase text-on-surface-variant transition-colors hover:text-primary"
          >
            Log Out
          </button>
        )}
      </div>
    </header>
  )
}
