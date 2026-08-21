import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_AVERAGE_PREP_TIME_MINUTES,
  DEFAULT_DELIVERY_END_TIME,
  DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES,
  DEFAULT_DELIVERY_START_TIME,
  DEFAULT_DELIVERY_ZONES,
  db,
  type DeliveryZone,
} from '../../db'
import { Button, Card, Input, Modal, Switch } from '../../components/ui'
import { fileToDataUrl } from '../../lib/files'
import {
  BUSINESS_SETTINGS_ID,
  addDeliveryZone,
  removeDeliveryZone,
  renameDeliveryZone,
  setAcceptingOrdersToday,
  setDeliveryZoneAutoRoute,
  updateDeliveryPaymentSettings,
} from './businessData'

function ZoneRow({ zone }: { zone: DeliveryZone }) {
  const [name, setName] = useState(zone.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Keep the input in sync if the zone changes out from under us (e.g. synced from
  // another device) without clobbering an in-progress edit on this one.
  useEffect(() => setName(zone.name), [zone.name])

  return (
    <div className="flex flex-wrap items-center gap-xs rounded-md border border-surface-dim bg-surface px-xs py-xs">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name.trim() !== zone.name) void renameDeliveryZone(zone.id, name)
          else setName(zone.name)
        }}
        placeholder="Zone name"
        aria-label="Zone name"
        className="min-w-[140px] flex-1 rounded border border-outline bg-surface-container-lowest px-xs py-[6px] text-body-md text-on-surface"
      />

      <label className="flex items-center gap-xs text-label-sm text-on-surface-variant">
        <Switch
          checked={zone.auto_route}
          onChange={(autoRoute) => void setDeliveryZoneAutoRoute(zone.id, autoRoute)}
          label={`${zone.name} auto-routes to kitchen`}
        />
        {zone.auto_route ? 'Auto-routes to kitchen' : 'Needs manual confirmation via Messenger'}
      </label>

      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        aria-label={`Delete zone ${zone.name}`}
        className="touch-target ml-auto flex shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
      >
        ×
      </button>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete Delivery Zone"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingDelete(false)
                void removeDeliveryZone(zone.id)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">Delete “{zone.name}”?</p>
      </Modal>
    </div>
  )
}

function AddZoneForm() {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await addDeliveryZone(name)
      setName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleAdd()
      }}
      className="flex gap-xs"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New zone name (e.g. Barangay Poblacion)"
        aria-label="New delivery zone name"
        className="flex-1"
      />
      <Button type="submit" variant="secondary" disabled={saving || !name.trim()}>
        + Zone
      </Button>
    </form>
  )
}

export function DeliveryPaymentSection() {
  const settings = useLiveQuery(() => db.businessSettings.get(BUSINESS_SETTINGS_ID))

  const acceptingOrdersToday = settings?.accepting_orders_today ?? true
  const zones = settings?.delivery_zones ?? DEFAULT_DELIVERY_ZONES

  const [gcashNumber, setGcashNumber] = useState('')
  const [deliveryStart, setDeliveryStart] = useState(DEFAULT_DELIVERY_START_TIME)
  const [deliveryEnd, setDeliveryEnd] = useState(DEFAULT_DELIVERY_END_TIME)
  const [slotInterval, setSlotInterval] = useState(String(DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES))
  const [avgPrepTime, setAvgPrepTime] = useState(String(DEFAULT_AVERAGE_PREP_TIME_MINUTES))
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Seed local form state from the record the first time it loads, without clobbering
  // edits in progress — same pattern as BusinessInfoSection.
  useEffect(() => {
    if (settings && !loadedOnce) {
      setGcashNumber(settings.gcash_number ?? '')
      setDeliveryStart(settings.delivery_start_time ?? DEFAULT_DELIVERY_START_TIME)
      setDeliveryEnd(settings.delivery_end_time ?? DEFAULT_DELIVERY_END_TIME)
      setSlotInterval(String(settings.delivery_slot_interval_minutes ?? DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES))
      setAvgPrepTime(String(settings.average_prep_time_minutes ?? DEFAULT_AVERAGE_PREP_TIME_MINUTES))
      setLoadedOnce(true)
    }
  }, [settings, loadedOnce])

  async function handleQrChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingQr(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      await updateDeliveryPaymentSettings({ gcash_qr_image: dataUrl })
    } finally {
      setUploadingQr(false)
      e.target.value = ''
    }
  }

  const gcashQrImage = settings?.gcash_qr_image ?? null

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Delivery &amp; Payment</h2>
      <p className="text-body-md text-on-surface-variant">
        Controls what online customers see and can order at /order — every field here saves immediately.
      </p>

      <div className="flex flex-wrap items-center gap-sm rounded-md border border-surface-dim bg-surface-container px-sm py-sm">
        <Switch
          checked={acceptingOrdersToday}
          onChange={(value) => void setAcceptingOrdersToday(value)}
          label="Accepting orders today"
        />
        <div className="flex flex-col">
          <span className="text-body-md font-bold text-on-surface">Accepting Orders Today</span>
          <span className="text-label-sm text-on-surface-variant">
            {acceptingOrdersToday
              ? 'Open — customers see the ordering flow.'
              : 'Closed — customers see a closed message, regardless of the delivery window below.'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-sm">
        <h3 className="text-label-bold text-on-surface-variant">GCash Payment</h3>
        <div className="flex flex-col gap-md md:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-xs">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-surface-dim bg-surface-container">
              {gcashQrImage ? (
                <img src={gcashQrImage} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="px-xs text-center text-label-sm text-on-surface-variant">No QR code</span>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
            <Button variant="secondary" size="md" disabled={uploadingQr} onClick={() => fileInputRef.current?.click()}>
              {uploadingQr ? 'Uploading…' : gcashQrImage ? 'Change QR' : 'Upload QR'}
            </Button>
            {gcashQrImage && (
              <button
                type="button"
                onClick={() => void updateDeliveryPaymentSettings({ gcash_qr_image: null })}
                className="text-label-sm text-on-surface-variant hover:text-error"
              >
                Remove QR
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-sm">
            <Input
              label="GCash Number"
              value={gcashNumber}
              onChange={(e) => setGcashNumber(e.target.value)}
              onBlur={() => void updateDeliveryPaymentSettings({ gcash_number: gcashNumber.trim() })}
              placeholder="0917 123 4567"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-sm">
        <h3 className="text-label-bold text-on-surface-variant">Today's Delivery Window</h3>
        <p className="text-label-sm text-on-surface-variant">
          Bounds the automatic ordering window even if nobody remembers to flip the switch above.
        </p>
        <div className="flex flex-wrap gap-sm">
          <Input
            type="time"
            label="Delivery Starts"
            value={deliveryStart}
            onChange={(e) => setDeliveryStart(e.target.value)}
            onBlur={() => void updateDeliveryPaymentSettings({ delivery_start_time: deliveryStart })}
            className="w-40"
          />
          <Input
            type="time"
            label="Delivery Ends"
            value={deliveryEnd}
            onChange={(e) => setDeliveryEnd(e.target.value)}
            onBlur={() => void updateDeliveryPaymentSettings({ delivery_end_time: deliveryEnd })}
            className="w-40"
          />
          <Input
            type="number"
            min={5}
            step="5"
            label="Slot Interval (minutes)"
            value={slotInterval}
            onChange={(e) => setSlotInterval(e.target.value)}
            onBlur={() => {
              const value = Math.max(5, Number(slotInterval) || DEFAULT_DELIVERY_SLOT_INTERVAL_MINUTES)
              setSlotInterval(String(value))
              void updateDeliveryPaymentSettings({ delivery_slot_interval_minutes: value })
            }}
            className="w-44"
          />
          <Input
            type="number"
            min={1}
            step="1"
            label="Average Prep Time (minutes)"
            value={avgPrepTime}
            onChange={(e) => setAvgPrepTime(e.target.value)}
            onBlur={() => {
              const value = Math.max(1, Number(avgPrepTime) || DEFAULT_AVERAGE_PREP_TIME_MINUTES)
              setAvgPrepTime(String(value))
              void updateDeliveryPaymentSettings({ average_prep_time_minutes: value })
            }}
            className="w-48"
          />
        </div>
      </div>

      <div className="flex flex-col gap-sm">
        <h3 className="text-label-bold text-on-surface-variant">
          Delivery Zones <span className="font-normal">— add, rename, or remove as needed</span>
        </h3>
        <div className="flex flex-col gap-xs">
          {zones.map((zone) => (
            <ZoneRow key={zone.id} zone={zone} />
          ))}
          {zones.length === 0 && <p className="text-body-md text-on-surface-variant">No delivery zones yet.</p>}
        </div>
        <AddZoneForm />
      </div>
    </Card>
  )
}
