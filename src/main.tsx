import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { db, seedDatabase } from './db'
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

// /order is the one route opened by an unauthenticated customer on their own device,
// not a staff iPad — it must never pull the full staff replica (every order, every
// user incl. PINs, every shift, ...) into that visitor's IndexedDB, and has no use for
// the offline-first sync engine. It talks to Supabase directly instead (see
// src/features/order/orderSupabaseData.ts). Every other route keeps today's boot.
if (!window.location.pathname.startsWith('/order')) {
  void boot().catch((err) => {
    console.error('Failed to initialize database', err)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
