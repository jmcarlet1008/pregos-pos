const SAFETY_NET_POLL_MS = 10_000

/**
 * Realtime alone isn't enough to keep a station screen (/kitchen, /fulfillment) correct:
 * a tablet/phone/PC that sleeps or loses Wi-Fi can end up with a websocket that's
 * silently dead (no CHANNEL_ERROR ever fires, so the "reconnect → refetch" path never
 * runs), and some transitions never produce an event for anon at all (see
 * useFulfillmentQueue's doc comment on RLS). This re-runs the screen's own refetch every
 * 10s, whenever the screen becomes visible again, and when the network comes back.
 * Returns a cleanup function.
 */
export function startSafetyNetPolling(refetch: () => void): () => void {
  const interval = setInterval(refetch, SAFETY_NET_POLL_MS)
  function onVisible() {
    if (document.visibilityState === 'visible') refetch()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', refetch)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', refetch)
  }
}
