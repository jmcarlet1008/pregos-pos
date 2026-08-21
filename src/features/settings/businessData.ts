import {
  BUSINESS_SETTINGS_ID,
  DEFAULT_ACCEPTING_ORDERS_TODAY,
  DEFAULT_AVERAGE_PREP_TIME_MINUTES,
  DEFAULT_DELIVERY_END_TIME,
  DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES,
  DEFAULT_DELIVERY_START_TIME,
  DEFAULT_DELIVERY_ZONES,
  db,
  timestamps,
  touch,
  type BusinessSettings,
  type DeliveryZone,
} from '../../db'

export { BUSINESS_SETTINGS_ID }

export interface BusinessSettingsInput {
  name: string
  logo_url: string | null
  address: string
  phone: string
}

export async function saveBusinessSettings(input: BusinessSettingsInput): Promise<void> {
  const existing = await db.businessSettings.get(BUSINESS_SETTINGS_ID)
  if (existing) {
    await db.businessSettings.put(
      touch({
        ...existing,
        name: input.name.trim(),
        logo_url: input.logo_url,
        address: input.address.trim(),
        phone: input.phone.trim(),
      }),
    )
    return
  }

  // No row yet (shouldn't normally happen — seedDatabase() always creates one — but
  // handle it defensively rather than crash): fall back to the same defaults seed.ts
  // uses for every other Delivery & Payment field.
  await db.businessSettings.add({
    id: BUSINESS_SETTINGS_ID,
    name: input.name.trim(),
    logo_url: input.logo_url,
    address: input.address.trim(),
    phone: input.phone.trim(),
    gcash_number: '',
    gcash_qr_image: null,
    accepting_orders_today: DEFAULT_ACCEPTING_ORDERS_TODAY,
    delivery_start_time: DEFAULT_DELIVERY_START_TIME,
    delivery_end_time: DEFAULT_DELIVERY_END_TIME,
    delivery_slot_interval_minutes: DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES,
    average_prep_time_minutes: DEFAULT_AVERAGE_PREP_TIME_MINUTES,
    delivery_zones: DEFAULT_DELIVERY_ZONES,
    sync_status: 'pending',
    ...timestamps(),
  })
}

/**
 * A pre-existing local row seeded before Delivery & Payment fields existed reads
 * these as `undefined` until touched (see schema.ts's BusinessSettings comment) —
 * this fills in the documented defaults so every read/write site sees real values.
 * Exported for src/features/order/orderSupabaseData.ts, which applies the same
 * defaulting to a row read live from Supabase rather than Dexie.
 */
export function withDeliveryDefaults(settings: BusinessSettings): BusinessSettings {
  return {
    ...settings,
    gcash_number: settings.gcash_number ?? '',
    gcash_qr_image: settings.gcash_qr_image ?? null,
    accepting_orders_today: settings.accepting_orders_today ?? DEFAULT_ACCEPTING_ORDERS_TODAY,
    delivery_start_time: settings.delivery_start_time ?? DEFAULT_DELIVERY_START_TIME,
    delivery_end_time: settings.delivery_end_time ?? DEFAULT_DELIVERY_END_TIME,
    delivery_slot_interval_minutes: settings.delivery_slot_interval_minutes ?? DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES,
    average_prep_time_minutes: settings.average_prep_time_minutes ?? DEFAULT_AVERAGE_PREP_TIME_MINUTES,
    delivery_zones: settings.delivery_zones ?? DEFAULT_DELIVERY_ZONES,
  }
}

async function getSettingsWithDefaults(): Promise<BusinessSettings | undefined> {
  const existing = await db.businessSettings.get(BUSINESS_SETTINGS_ID)
  return existing ? withDeliveryDefaults(existing) : undefined
}

export type DeliveryPaymentPatch = Partial<
  Pick<
    BusinessSettings,
    | 'gcash_number'
    | 'gcash_qr_image'
    | 'delivery_start_time'
    | 'delivery_end_time'
    | 'delivery_slot_interval_minutes'
    | 'average_prep_time_minutes'
  >
>

/** Instant per-field save for the Delivery & Payment section (see DeliveryPaymentSection.tsx). */
export async function updateDeliveryPaymentSettings(patch: DeliveryPaymentPatch): Promise<void> {
  const existing = await getSettingsWithDefaults()
  if (!existing) return
  await db.businessSettings.put(touch({ ...existing, ...patch }))
}

/** Instant manual Open/Closed switch for online ordering. */
export async function setAcceptingOrdersToday(value: boolean): Promise<void> {
  const existing = await getSettingsWithDefaults()
  if (!existing) return
  await db.businessSettings.put(touch({ ...existing, accepting_orders_today: value }))
}

async function saveZones(zones: DeliveryZone[]): Promise<void> {
  const existing = await getSettingsWithDefaults()
  if (!existing) return
  await db.businessSettings.put(touch({ ...existing, delivery_zones: zones }))
}

export async function addDeliveryZone(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await getSettingsWithDefaults()
  if (!existing) return
  const zone: DeliveryZone = { id: crypto.randomUUID(), name: trimmed, auto_route: true }
  await saveZones([...existing.delivery_zones, zone])
}

export async function renameDeliveryZone(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await getSettingsWithDefaults()
  if (!existing) return
  await saveZones(existing.delivery_zones.map((z) => (z.id === id ? { ...z, name: trimmed } : z)))
}

export async function setDeliveryZoneAutoRoute(id: string, autoRoute: boolean): Promise<void> {
  const existing = await getSettingsWithDefaults()
  if (!existing) return
  await saveZones(existing.delivery_zones.map((z) => (z.id === id ? { ...z, auto_route: autoRoute } : z)))
}

export async function removeDeliveryZone(id: string): Promise<void> {
  const existing = await getSettingsWithDefaults()
  if (!existing) return
  await saveZones(existing.delivery_zones.filter((z) => z.id !== id))
}
