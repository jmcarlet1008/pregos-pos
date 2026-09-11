import { supabase } from './supabaseClient'

/**
 * Device-level Supabase Auth for the iPad PWA (Tier B of the PIN/RLS security fix).
 *
 * This is a *device* credential, not a per-staff-member login — completely separate
 * from the PIN system in features/auth/AuthContext.tsx, which stays local/offline and
 * untouched by this. One shared account gets signed into once per physical iPad (see
 * DeviceAuthSection.tsx, surfaced in Settings), and supabase-js persists that session
 * to localStorage + auto-refreshes it by default (no extra code needed) — this is what
 * lets `users`/`shifts`/`stock_adjustments`/full order history be gated to
 * `authenticated` in RLS while still working on an iPad that's offline overnight.
 *
 * `/order`, `/kitchen`, `/fulfillment` never import this module (main.tsx only
 * dynamically imports it for non-station routes — see isPublicStationRoute), so it
 * never ships in the bundle those routes' visitors download; a build-time embedded
 * credential would defeat that, which is why this is an interactive sign-in (typed
 * once during setup) rather than an env-var auto-login.
 */

export interface DeviceAuthStatus {
  connected: boolean
  email: string | null
}

async function readStatus(): Promise<DeviceAuthStatus> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  return { connected: Boolean(session), email: session?.user.email ?? null }
}

/**
 * Called from main.tsx's boot() for every non-station route. Deliberately does not
 * prompt or block: a device that hasn't been connected yet (or whose session expired
 * without network to refresh) must still boot into local Dexie/offline PIN login —
 * this only logs so a missing session is visible in the console/support flow, never a
 * crash or a blocking screen.
 */
export async function ensureDeviceSession(): Promise<void> {
  try {
    const status = await readStatus()
    if (!status.connected) {
      console.warn(
        'This device has no Supabase device session — sync of users/shifts/stock/full order ' +
          'history will be restricted until a manager connects it in Settings.',
      )
    }
  } catch (err) {
    console.error('Device session check failed (continuing in local/offline mode)', err)
  }
}

export function getDeviceAuthStatus(): Promise<DeviceAuthStatus> {
  return readStatus()
}

export function onDeviceAuthChange(callback: (status: DeviceAuthStatus) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback({ connected: Boolean(session), email: session?.user.email ?? null })
  })
  return () => data.subscription.unsubscribe()
}

export async function connectDevice(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function disconnectDevice(): Promise<void> {
  await supabase.auth.signOut()
}
