import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Button'
import { CloseIcon, RefreshIcon } from './icons'

// A tablet running /kitchen or /fulfillment can stay open across a deploy with no
// navigation to trigger the browser's own service-worker update check. Poll for a
// waiting update on an interval so a stale tab notices a new deploy in bounded time.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000

export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  // A fresh update should always re-prompt, even if an earlier one was dismissed.
  useEffect(() => {
    if (needRefresh) setDismissed(false)
  }, [needRefresh])

  if (!needRefresh || dismissed) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-md border-b border-surface-dim bg-surface-container-lowest px-md py-sm shadow-md">
      <div className="flex items-center gap-sm text-on-surface">
        <RefreshIcon width={18} height={18} />
        <span className="text-body-md">A new version is available.</span>
      </div>
      <div className="flex items-center gap-sm">
        <Button size="md" variant="primary" onClick={() => updateServiceWorker(true)}>
          Tap to refresh
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update notice"
          className="touch-target flex shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
        >
          <CloseIcon width={18} height={18} />
        </button>
      </div>
    </div>
  )
}
