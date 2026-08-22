import type { SVGProps } from 'react'

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export function RegisterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" stroke="currentColor" />
      <path d="M3 12h18" stroke="currentColor" />
    </Icon>
  )
}

export function InventoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 8L12 3l9 5-9 5-9-5Z" stroke="currentColor" />
      <path d="M3 8v8l9 5 9-5V8" stroke="currentColor" />
      <path d="M12 13v8" stroke="currentColor" />
    </Icon>
  )
}

export function MenuEditorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h10M4 18h16" stroke="currentColor" />
      <path d="M17 15l3 3-3 3" stroke="currentColor" />
    </Icon>
  )
}

export function AnalyticsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" />
    </Icon>
  )
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
      />
    </Icon>
  )
}

export function SupportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.29c-.86.4-1.5 1.02-1.5 2.21" stroke="currentColor" />
      <path d="M12 17.5h.01" stroke="currentColor" strokeWidth="2.5" />
    </Icon>
  )
}

export function WifiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 12.55a11 11 0 0 1 14 0" stroke="currentColor" />
      <path d="M8.5 16.05a6 6 0 0 1 7 0" stroke="currentColor" />
      <path d="M12 19.5h.01" stroke="currentColor" strokeWidth="2.5" />
    </Icon>
  )
}

export function WifiOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2 2l20 20" stroke="currentColor" />
      <path d="M8.5 16.05a6 6 0 0 1 7 0" stroke="currentColor" />
      <path d="M5 12.55a11 11 0 0 1 4.5-2.6M18.9 12.4a11 11 0 0 0-2.3-1.75" stroke="currentColor" />
      <path d="M12 19.5h.01" stroke="currentColor" strokeWidth="2.5" />
    </Icon>
  )
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" />
    </Icon>
  )
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" />
    </Icon>
  )
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" />
    </Icon>
  )
}

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20 11A8 8 0 0 0 6.34 6.34L4 8.67" stroke="currentColor" />
      <path d="M4 4v4.67h4.67" stroke="currentColor" />
      <path d="M4 13a8 8 0 0 0 13.66 4.66L20 15.33" stroke="currentColor" />
      <path d="M20 20v-4.67h-4.67" stroke="currentColor" />
    </Icon>
  )
}

/** Walk-in / dine-in: a customer standing at the counter. */
export function WalkInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="6" r="3" stroke="currentColor" />
      <path d="M6 21v-2a6 6 0 0 1 12 0v2" stroke="currentColor" />
      <path d="M2 17h20" stroke="currentColor" />
    </Icon>
  )
}

/** Pickup: a takeout bag. */
export function BagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 8h12l1 13H5L6 8Z" stroke="currentColor" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" />
    </Icon>
  )
}

/** Delivery: a scooter. */
export function ScooterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="18" r="2.5" stroke="currentColor" />
      <circle cx="17" cy="18" r="2.5" stroke="currentColor" />
      <path d="M6 18h6l1.5-6H17" stroke="currentColor" />
      <path d="M12 12l2-5h3" stroke="currentColor" />
      <path d="M8 7h3" stroke="currentColor" />
    </Icon>
  )
}
