import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { RegisterPage } from './features/register/RegisterPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { MenuEditorPage } from './features/menu/MenuEditorPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { LoginPage } from './features/auth/LoginPage'
import { AuthProvider } from './features/auth/AuthContext'
import { RequireAuth, RequireRole } from './features/auth/RequireAuth'
import { ROUTES } from './routes'

const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to={ROUTES.register} replace /> },
      { path: ROUTES.register, element: <RegisterPage /> },
      {
        path: ROUTES.inventory,
        element: (
          <RequireRole role="manager">
            <InventoryPage />
          </RequireRole>
        ),
      },
      {
        path: ROUTES.menu,
        element: (
          <RequireRole role="manager">
            <MenuEditorPage />
          </RequireRole>
        ),
      },
      {
        path: ROUTES.analytics,
        element: (
          <RequireRole role="manager">
            <AnalyticsPage />
          </RequireRole>
        ),
      },
      {
        path: ROUTES.settings,
        element: (
          <RequireRole role="manager">
            <SettingsPage />
          </RequireRole>
        ),
      },
      {
        path: ROUTES.support,
        element: (
          <RequireRole role="manager">
            <SettingsPage />
          </RequireRole>
        ),
      },
    ],
  },
])

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
