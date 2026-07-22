import { useEffect, useState } from 'react'
import { Card } from '../../components/ui'

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

const STEPS = [
  'Open this page in Safari on the iPad (not Chrome — "Add to Home Screen" only works in Safari).',
  'Tap the Share icon (a square with an arrow pointing up) in the toolbar.',
  'Scroll down the share sheet and tap "Add to Home Screen".',
  'Tap "Add" in the top-right corner.',
  'Launch Pregos POS from the new icon on the Home Screen — it opens full-screen, like a native app.',
]

export function InstallGuideSection() {
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const query = window.matchMedia('(display-mode: standalone)')
    function handleChange() {
      setInstalled(isStandalone())
    }
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  return (
    <Card padding="md" className="flex flex-col gap-sm">
      <h2 className="text-headline-md text-on-surface">Install on iPad</h2>

      {installed ? (
        <p className="text-body-md text-on-surface-variant">
          You're all set — Pregos POS is installed and running full-screen from the Home Screen icon on this device.
        </p>
      ) : (
        <>
          <p className="text-body-md text-on-surface-variant">
            Add Pregos POS to the Home Screen so it launches full-screen and works offline, just like a native app.
          </p>
          <ol className="flex flex-col gap-sm">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-sm">
                <span className="flex h-touch w-touch shrink-0 items-center justify-center rounded-full bg-primary-container text-label-bold text-on-primary-container">
                  {index + 1}
                </span>
                <span className="pt-xs text-body-md text-on-surface">{step}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  )
}
