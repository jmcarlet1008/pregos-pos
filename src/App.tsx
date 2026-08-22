import { Suspense, lazy } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { UpdateBanner } from './components/ui'
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

// Lazy (not a static import): keeps /order out of the main app bundle so it forms its
// own `realtime-order` chunk, excluded from the PWA offline precache — see the
// manualChunks/navigateFallbackDenylist comments in vite.config.ts.
const OrderPage = lazy(() => import('./features/order/OrderPage').then((m) => ({ default: m.OrderPage })))
// Same rationale as OrderPage above — its own `realtime-kitchen` chunk.
const KitchenPage = lazy(() => import('./features/kitchen/KitchenPage').then((m) => ({ default: m.KitchenPage })))

const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPage /> },
  // Public, customer-facing — deliberately a top-level sibling here, not nested under
  // RequireAuth/AppShell below, so it never touches the staff PIN gate.
  {
    path: ROUTES.order,
    element: (
      <Suspense fallback={null}>
        <OrderPage />
      </Suspense>
    ),
  },
  // Public, shared-station screen — deliberately a top-level sibling here too, not
  // nested under RequireAuth/AppShell: no Manager PIN gating (shared kitchen station
  // device, per the request), and AppShell's TopBar/Sidebar assume an authenticated
  // `user` that never exists on this route.
  {
    path: ROUTES.kitchen,
    element: (
      <Suspense fallback={null}>
        <KitchenPage />
      </Suspense>
    ),
  },
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
      <UpdateBanner />
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
