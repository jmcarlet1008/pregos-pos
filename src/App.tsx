import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { RegisterPage } from './features/register/RegisterPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { MenuEditorPage } from './features/menu/MenuEditorPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { ROUTES } from './routes'

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={ROUTES.register} replace /> },
      { path: ROUTES.register, element: <RegisterPage /> },
      { path: ROUTES.inventory, element: <InventoryPage /> },
      { path: ROUTES.menu, element: <MenuEditorPage /> },
      { path: ROUTES.analytics, element: <AnalyticsPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
