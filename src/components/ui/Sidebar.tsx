import { NavLink } from 'react-router-dom'
import { ROUTES } from '../../routes'
import {
  AnalyticsIcon,
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
}

const primaryNav: NavItem[] = [
  { to: ROUTES.register, label: 'Register', icon: RegisterIcon },
  { to: ROUTES.inventory, label: 'Inventory', icon: InventoryIcon },
  { to: ROUTES.menu, label: 'Menu Editor', icon: MenuEditorIcon },
  { to: ROUTES.analytics, label: 'Analytics', icon: AnalyticsIcon },
]

const secondaryNav: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/support', label: 'Support', icon: SupportIcon },
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

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-surface-dim bg-surface-container-lowest">
      <div className="flex min-h-touch items-center bg-primary px-md py-md">
        <span className="text-headline-md text-on-primary">Prego's Cucina</span>
      </div>

      <nav className="flex flex-1 flex-col gap-xs p-sm">
        {primaryNav.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>

      <nav className="flex flex-col gap-xs border-t border-surface-dim p-sm">
        {secondaryNav.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>
    </aside>
  )
}
