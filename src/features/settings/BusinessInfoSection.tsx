import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../db'
import { Button, Card, Input } from '../../components/ui'
import { fileToDataUrl } from '../../lib/files'
import { BUSINESS_SETTINGS_ID, saveBusinessSettings } from './businessData'

interface FormState {
  name: string
  logo_url: string | null
  address: string
  phone: string
}

const EMPTY_FORM: FormState = { name: '', logo_url: null, address: '', phone: '' }

export function BusinessInfoSection() {
  const settings = useLiveQuery(() => db.businessSettings.get(BUSINESS_SETTINGS_ID))
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Seed local form state from the record the first time it loads, without clobbering edits in progress.
  useEffect(() => {
    if (settings && !loadedOnce) {
      setForm({
        name: settings.name,
        logo_url: settings.logo_url,
        address: settings.address,
        phone: settings.phone,
      })
      setLoadedOnce(true)
    }
  }, [settings, loadedOnce])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      update('logo_url', dataUrl)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveBusinessSettings(form)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Business Info</h2>
      <p className="text-body-md text-on-surface-variant">
        Shown on printed receipts and elsewhere in the app.
      </p>

      <div className="flex flex-col gap-md md:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-xs">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-surface-dim bg-surface-container">
            {form.logo_url ? (
              <img src={form.logo_url} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="px-xs text-center text-label-sm text-on-surface-variant">No logo</span>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          <Button variant="secondary" size="md" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading…' : form.logo_url ? 'Change Logo' : 'Upload Logo'}
          </Button>
          {form.logo_url && (
            <button
              type="button"
              onClick={() => update('logo_url', null)}
              className="text-label-sm text-on-surface-variant hover:text-error"
            >
              Remove logo
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-sm">
          <Input label="Store Name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Prego's Cucina" />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            placeholder="123 Rizal St., Poblacion"
          />
          <Input
            label="Phone Number"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="0917 123 4567"
          />
        </div>
      </div>

      <div className="flex items-center gap-sm">
        <Button variant="primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Business Info'}
        </Button>
        {saved && <span className="text-label-bold text-on-surface-variant">Saved.</span>}
      </div>
    </Card>
  )
}
