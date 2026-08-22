import { BUSINESS_SETTINGS_ID, type BusinessSettings } from '../db'
import { withDeliveryDefaults } from '../features/settings/businessData'
import { supabase } from './supabaseClient'

/**
 * Direct-Supabase BusinessSettings read/subscribe, extracted out of
 * src/features/order/orderSupabaseData.ts (which re-exports these for backward
 * compatibility) so a second direct-Supabase consumer — src/features/kitchen/ — can use
 * it without importing across the order/kitchen feature-folder boundary (see
 * orderWorkflow.ts's file-location comment for why that boundary matters here).
 */

/**
 * business_settings has no sync_status column server-side (it's a local-only Dexie
 * concept — see schema.ts) — bolt on a placeholder so the row satisfies the shared
 * BusinessSettings type, same trick pull.ts uses when reading a remote row into Dexie.
 */
function toBusinessSettings(row: object): BusinessSettings {
  return withDeliveryDefaults({ ...row, sync_status: 'synced' } as BusinessSettings)
}

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  const { data, error } = await supabase.from('business_settings').select('*').eq('id', BUSINESS_SETTINGS_ID).single()
  if (error) throw new Error(`Failed to load business settings: ${error.message}`)
  return toBusinessSettings(data)
}

/**
 * Realtime: reacts instantly if staff flip Accepting Orders, edit the delivery window,
 * or change average_prep_time_minutes while a customer or kitchen station already has
 * this open, instead of waiting on any poll. Returns an unsubscribe function for a
 * useEffect cleanup.
 */
export function subscribeBusinessSettings(onChange: (settings: BusinessSettings) => void): () => void {
  const channel = supabase
    .channel('public:business_settings')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'business_settings', filter: `id=eq.${BUSINESS_SETTINGS_ID}` },
      (payload) => onChange(toBusinessSettings(payload.new)),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
