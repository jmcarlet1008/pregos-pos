import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Button'
import { RefreshIcon } from './icons'

/**
 * react-router `errorElement` fallback for every top-level route. Without this, an
 * uncaught render error (most commonly: a stale, already-installed service worker still
 * running old JS that doesn't know about a shape the backend now sends — e.g. the
 * pre-`phone`-channel bundle crashing on `breakdown.channel['phone']`) shows Router's
 * own raw developer-facing crash dump, with no way for a non-technical user to recover
 * short of knowing to manually clear site data. This replaces that with a plain-language
 * screen and a Reload button that actively tries to get the device unstuck rather than
 * just repeating the same stale load.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)

  async function handleReload() {
    if (needRefresh) {
      // A newer version was already detected and is sitting there waiting — this
      // activates it and reloads. Handles the common case head-on: this crash is
      // usually itself the symptom of an already-known pending update.
      await updateServiceWorker(true)
      return
    }
    // No update was already flagged — nudge the service worker to check right now (in
    // case this device just hasn't polled yet) before falling back to a hard reload.
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        await registration?.update()
      } catch {
        // Best-effort — fall through to reload regardless.
      }
    }
    window.location.reload()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-md bg-surface px-lg py-xl text-center">
      <RefreshIcon width={40} height={40} className="text-on-surface-variant" />
      <h1 className="text-headline-md text-on-surface">Something went wrong</h1>
      <p className="max-w-[28rem] text-body-md text-on-surface-variant">
        This screen ran into an error. This usually clears up with a reload — especially if the
        app was left open from before a recent update.
      </p>
      <Button variant="primary" size="lg" onClick={handleReload}>
        Reload
      </Button>
      <details className="mt-md max-w-[28rem] text-left text-label-sm text-on-surface-variant">
        <summary className="cursor-pointer">Technical details</summary>
        <pre className="mt-xs overflow-x-auto whitespace-pre-wrap break-words">{detail}</pre>
      </details>
    </div>
  )
}
