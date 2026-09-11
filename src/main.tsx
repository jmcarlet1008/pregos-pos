import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { db, seedDatabase } from './db'
import { isPublicStationRoute } from './lib/deviceRoute'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { pullChanges } from './sync/pull'
import { startSyncEngine } from './sync/syncEngine'

if (import.meta.env.DEV) {
  // Query seed data from the browser console, e.g. `await db.products.toArray()`
  Object.assign(window, { db })
}

/**
 * Pulls any existing cloud data down *before* deciding whether to seed the demo
 * menu. Without this, a brand-new device (empty local IndexedDB — e.g. logging in
 * from a second iPad/browser) would seed the demo catalog first with sync_status
 * 'pending', and the sync engine's own "don't clobber a pending local row" pull
 * logic would then block the real production data from ever being pulled in —
 * see sync/pull.ts and sync/push.ts for the mechanics this avoids. seedDatabase()
 * already no-ops once its tables are non-empty, so this pull is what makes that
 * check see the real state instead of an empty new-device database.
 */
async function boot() {
  // Dynamic import (not a static top-of-file one): this keeps deviceAuth.ts — and any
  // credential a manager has signed in with — out of the bundle that /order, /kitchen,
  // and /fulfillment visitors download, since this branch never runs for those routes.
  // See lib/deviceAuth.ts's doc comment. Failure here must never block local
  // Dexie/offline PIN login, so it's fire-and-forget, same as the pull below.
  if (isSupabaseConfigured) {
    try {
      const { ensureDeviceSession } = await import('./lib/deviceAuth')
      await ensureDeviceSession()
    } catch (err) {
      console.error('Device session check failed, continuing in local/offline mode', err)
    }
  }

  if (isSupabaseConfigured) {
    try {
      await pullChanges(null)
    } catch (err) {
      console.error('Initial pull failed, falling back to local/seed state', err)
    }
  }
  await seedDatabase()
  startSyncEngine()
}

// /order, /kitchen, and /fulfillment are opened on a device that never needs the full
// staff Dexie replica (every order, every user incl. PINs, every shift, ...) — a
// customer's own phone for /order, or a shared kitchen/front-counter/dispatch station
// for the other two — and have no use for the offline-first sync engine. They talk to
// Supabase directly instead (see src/features/order/orderSupabaseData.ts,
// src/features/kitchen/kitchenSupabaseData.ts, and
// src/features/fulfillment/fulfillmentSupabaseData.ts). Every other route keeps today's boot.
if (!isPublicStationRoute(window.location.pathname)) {
  void boot().catch((err) => {
    console.error('Failed to initialize database', err)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
