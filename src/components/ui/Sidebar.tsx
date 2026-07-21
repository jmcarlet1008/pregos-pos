import { NavLink } from 'react-router-dom'
import { ROUTES } from '../../routes'
import { useAuth } from '../../features/auth/AuthContext'
import {
  AnalyticsIcon,
  CloseIcon,
  InventoryIcon,
  MenuEditorIcon,
  RegisterIcon,
  SettingsIcon,
  SupportIcon,
} from './icons'
import type { ComponentType, SVGProps } from 'react'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  managerOnly?: boolean
}

const primaryNav: NavItem[] = [
  { to: ROUTES.register, label: 'Register', icon: RegisterIcon },
  { to: ROUTES.inventory, label: 'Inventory', icon: InventoryIcon, managerOnly: true },
  { to: ROUTES.menu, label: 'Menu Editor', icon: MenuEditorIcon, managerOnly: true },
  { to: ROUTES.analytics, label: 'Analytics', icon: AnalyticsIcon, managerOnly: true },
]

const secondaryNav: NavItem[] = [
  { to: ROUTES.settings, label: 'Settings', icon: SettingsIcon, managerOnly: true },
  { to: ROUTES.support, label: 'Support', icon: SupportIcon, managerOnly: true },
]

function NavRow({ to, label, icon: IconComponent }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'flex min-h-touch items-center gap-sm rounded-lg px-sm text-body-md font-body transition-colors',
          isActive
            ? 'bg-primary text-on-primary font-bold'
            : 'text-on-surface hover:bg-surface-container',
        ].join(' ')
      }
    >
      <IconComponent className="shrink-0" width={20} height={20} />
      <span>{label}</span>
    </NavLink>
  )
}

export interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth()
  const visibleNav = primaryNav.filter((item) => !item.managerOnly || user?.role === 'manager')
  const visibleSecondaryNav = secondaryNav.filter((item) => !item.managerOnly || user?.role === 'manager')

  return (
    <aside
      inert={!open}
      aria-hidden={!open}
      className={[
        'flex h-full shrink-0 flex-col overflow-hidden border-r border-surface-dim bg-surface-container-lowest transition-[width] duration-200',
        open ? 'w-64' : 'w-0 border-r-0',
      ].join(' ')}
    >
      <div className="flex min-h-touch w-64 items-center justify-between bg-primary px-md py-md">
        <span className="text-headline-md text-on-primary">Prego's Cucina</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide sidebar"
          className="touch-target flex shrink-0 items-center justify-center rounded-full text-on-primary hover:bg-primary-container"
        >
          <CloseIcon width={20} height={20} />
        </button>
      </div>

      <nav className="flex w-64 flex-1 flex-col gap-xs p-sm">
        {visibleNav.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>

      <nav className="flex w-64 flex-col gap-xs border-t border-surface-dim p-sm">
        {visibleSecondaryNav.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>
    </aside>
  )
}
