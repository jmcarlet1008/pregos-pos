/**
 * `/order`, `/kitchen`, and `/fulfillment` are the app's public, no-login "station"
 * routes — a customer's own phone for `/order`, or a shared kitchen/dispatch device
 * for the other two — opened on arbitrary devices with no staff PIN login step. They
 * talk to Supabase directly under the `anon` role and never need the full staff Dexie
 * replica (see main.tsx's `boot()`).
 *
 * Every other route lives inside the iPad-based staff PWA (PIN login/clock-in,
 * `/manage-orders`, Settings, etc.) and is the only surface that establishes the
 * device-level Supabase Auth session (see lib/deviceAuth.ts) needed to read/write
 * `users`, `shifts`, `stock_adjustments`, and full order history under RLS.
 */
const PUBLIC_STATION_PREFIXES = ['/order', '/kitchen', '/fulfillment'] as const

export function isPublicStationRoute(pathname: string): boolean {
  return PUBLIC_STATION_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
