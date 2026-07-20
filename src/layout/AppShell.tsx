import { Outlet } from 'react-router-dom'
import { Sidebar, TopBar } from '../components/ui'

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto p-md">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
