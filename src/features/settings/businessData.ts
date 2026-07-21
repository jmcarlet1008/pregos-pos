import { BUSINESS_SETTINGS_ID, db } from '../../db'

export { BUSINESS_SETTINGS_ID }

export interface BusinessSettingsInput {
  name: string
  logo_url: string | null
  address: string
  phone: string
}

export async function saveBusinessSettings(input: BusinessSettingsInput): Promise<void> {
  const existing = await db.businessSettings.get(BUSINESS_SETTINGS_ID)
  const now = new Date().toISOString()
  await db.businessSettings.put({
    id: BUSINESS_SETTINGS_ID,
    name: input.name.trim(),
    logo_url: input.logo_url,
    address: input.address.trim(),
    phone: input.phone.trim(),
    sync_status: 'pending',
    created_at: existing?.created_at ?? now,
    updated_at: now,
  })
}
