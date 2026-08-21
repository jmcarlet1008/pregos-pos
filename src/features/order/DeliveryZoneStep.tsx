import { useState } from 'react'
import type { DeliveryAddress, DeliveryZone } from '../../db'
import { Button, Input } from '../../components/ui'

export interface DeliveryZoneStepProps {
  zones: DeliveryZone[]
  onConfirm: (zone: DeliveryZone, address: DeliveryAddress, lat: number | null, lng: number | null) => void
  onBack: () => void
}

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied'

/**
 * Renders whatever delivery_zones are configured in BusinessSettings — no hardcoded
 * zone names, so a new zone added in Settings shows up here with no code change. Zones
 * flagged auto_route get a required structured Block/Lot/Phase/Street form; the rest
 * get a manual-confirmation note plus a rough area/address field, since staff work out
 * exact delivery logistics for those over Messenger. Either way, sharing the browser's
 * current location is optional and purely supplementary — it's never required to
 * submit, and the typed address is always what staff act on (a customer's current
 * position may not match where they want delivery).
 */
export function DeliveryZoneStep({ zones, onConfirm, onBack }: DeliveryZoneStepProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [block, setBlock] = useState('')
  const [lot, setLot] = useState('')
  const [phase, setPhase] = useState('')
  const [street, setStreet] = useState('')
  const [area, setArea] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null

  function shareLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('denied')
      return
    }
    setLocationStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationStatus('granted')
      },
      () => setLocationStatus('denied'),
      { timeout: 10_000 },
    )
  }

  const canSubmit = selectedZone
    ? selectedZone.auto_route
      ? Boolean(block.trim() && lot.trim() && phase.trim() && street.trim())
      : Boolean(area.trim())
    : false

  function handleSubmit() {
    if (!selectedZone || !canSubmit) return
    const address: DeliveryAddress = selectedZone.auto_route
      ? { type: 'structured', block: block.trim(), lot: lot.trim(), phase: phase.trim(), street: street.trim() }
      : { type: 'freeform', area: area.trim() }
    onConfirm(selectedZone, address, coords?.lat ?? null, coords?.lng ?? null)
  }

  return (
    <div className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">Where should we deliver?</h2>

      <div className="flex flex-col gap-xs">
        {zones.length === 0 && (
          <p className="text-body-md text-on-surface-variant">No delivery zones are set up yet — please try Pickup instead.</p>
        )}
        {zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            onClick={() => setSelectedZoneId(zone.id)}
            aria-pressed={selectedZoneId === zone.id}
            className={[
              'flex min-h-touch items-center justify-between rounded-md border px-md text-body-md transition-colors',
              selectedZoneId === zone.id
                ? 'border-primary bg-primary-fixed text-on-primary-fixed'
                : 'border-outline text-on-surface hover:bg-surface-container',
            ].join(' ')}
          >
            {zone.name}
          </button>
        ))}
      </div>

      {selectedZone?.auto_route && (
        <div className="grid grid-cols-2 gap-sm">
          <Input label="Block" value={block} onChange={(e) => setBlock(e.target.value)} required />
          <Input label="Lot" value={lot} onChange={(e) => setLot(e.target.value)} required />
          <Input label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)} required />
          <Input label="Street" value={street} onChange={(e) => setStreet(e.target.value)} required />
        </div>
      )}

      {selectedZone && !selectedZone.auto_route && (
        <div className="flex flex-col gap-sm rounded-md border border-surface-dim bg-surface-container px-md py-sm">
          <p className="text-body-md text-on-surface-variant">
            This area needs a bit more coordination — our staff will confirm the delivery fee and logistics with you
            over Facebook Messenger after you place your order.
          </p>
          <Input
            label="Rough area / address"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. Barangay Poblacion, near the plaza"
            required
          />
        </div>
      )}

      {selectedZone && (
        <div className="flex flex-col gap-xs">
          <Button variant="secondary" onClick={shareLocation} disabled={locationStatus === 'requesting'}>
            📍{' '}
            {locationStatus === 'granted'
              ? 'Location shared'
              : locationStatus === 'requesting'
                ? 'Getting your location…'
                : 'Share my current location'}
          </Button>
          {locationStatus === 'denied' && (
            <p className="text-label-sm text-on-surface-variant">
              Couldn't get your location — no problem, we'll use the address above.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-sm">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" fullWidth disabled={!canSubmit} onClick={handleSubmit}>
          Continue
        </Button>
      </div>
    </div>
  )
}
