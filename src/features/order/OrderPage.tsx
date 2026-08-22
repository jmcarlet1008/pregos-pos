import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { BusinessSettings, DeliveryAddress, DeliveryZone, FulfillmentType, ModifierOption, Product } from '../../db'
import { Button } from '../../components/ui'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { evaluateOpenState, generateTimeSlots, slotToIso } from './businessHours'
import { CartSheet } from './CartSheet'
import { type CartLine, cartTotal } from './cartTypes'
import { ClosedNotice } from './ClosedNotice'
import { CustomerInfoStep } from './CustomerInfoStep'
import { CustomerLineModal } from './CustomerLineModal'
import { DeliveryZoneStep } from './DeliveryZoneStep'
import { FulfillmentStep } from './FulfillmentStep'
import { MenuBrowser } from './MenuBrowser'
import { OrderConfirmation } from './OrderConfirmation'
import { OrderProgress, orderProgressFor } from './OrderProgress'
import {
  type Fulfillment,
  type OnlineMenu,
  type PaymentInput,
  fetchBusinessSettings,
  fetchMenu,
  submitOnlineOrder,
  subscribeBusinessSettings,
} from './orderSupabaseData'
import { PaymentStep } from './PaymentStep'
import { TimeSlotStep } from './TimeSlotStep'

export type Screen = 'menu' | 'fulfillment' | 'zone' | 'timeslot' | 'payment' | 'customerInfo' | 'confirmation'

function id() {
  return crypto.randomUUID()
}

interface PageShellProps {
  settings?: BusinessSettings | null
  // Omitted on the not-configured/loadError/loading/closed early returns below, where
  // there's no meaningful step to show progress against.
  progress?: { steps: string[]; currentIndex: number }
  children: ReactNode
}

function PageShell({ settings, progress, children }: PageShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-md bg-surface p-md">
      <header className="flex items-center gap-sm border-b border-surface-dim pb-sm">
        {settings?.logo_url && <img src={settings.logo_url} alt="" className="h-10 w-10 rounded-full object-cover" />}
        <h1 className="text-headline-md text-on-surface">{settings?.name || "Prego's Cucina"}</h1>
      </header>
      {progress && <OrderProgress {...progress} />}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/**
 * Public, unauthenticated ordering page — see routes.ts/App.tsx for how this route
 * skips the staff PIN gate entirely, and main.tsx for why it never boots Dexie/the
 * sync engine. Everything here reads/writes Supabase directly (orderSupabaseData.ts)
 * and reacts to a live Realtime subscription on BusinessSettings.
 */
export function OrderPage() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null)
  const [menu, setMenu] = useState<OnlineMenu | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [addModalProduct, setAddModalProduct] = useState<Product | null>(null)
  const [editingLine, setEditingLine] = useState<CartLine | null>(null)

  const [screen, setScreen] = useState<Screen>('menu')
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType | null>(null)
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [payment, setPayment] = useState<PaymentInput | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    // StrictMode (see main.tsx) double-invokes this effect in dev: mount, cleanup,
    // mount. Cleanup fires synchronously, before `load`'s awaits resolve, so a bare
    // `unsubscribe?.()` cleanup can't cancel the still-in-flight first run — both the
    // stale and the real run would go on to call subscribeBusinessSettings(), opening
    // two Realtime subscriptions on the same channel topic and crashing with "cannot
    // add postgres_changes callbacks ... after subscribe()". `cancelled` lets the stale
    // run notice, once its awaits finally settle, that it's already been cleaned up.
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    async function load() {
      try {
        const [initialSettings, initialMenu] = await Promise.all([fetchBusinessSettings(), fetchMenu()])
        if (cancelled) return
        setSettings(initialSettings)
        setMenu(initialMenu)
        unsubscribe = subscribeBusinessSettings(setSettings)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load. Please refresh and try again.')
      }
    }

    void load()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  // evaluateOpenState no longer depends on time of day (see businessHours.ts) — this
  // interval isn't for that. It's for timeSlots below: generateTimeSlots needs a
  // periodically-refreshed `now` to drop slots as they pass and to roll its
  // overnight-window day-anchor forward across midnight.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const openState = settings ? evaluateOpenState(settings) : null
  const timeSlots = useMemo(() => (settings ? generateTimeSlots(settings, now) : []), [settings, now])

  function handleAddConfirm(selections: ModifierOption[], quantity: number, remarks: string | null) {
    if (!addModalProduct) return
    setCart((prev) => [...prev, { id: id(), product: addModalProduct, selections, quantity, remarks }])
    setAddModalProduct(null)
  }

  function handleEditConfirm(selections: ModifierOption[], quantity: number, remarks: string | null) {
    if (!editingLine) return
    setCart((prev) =>
      prev.map((line) => (line.id === editingLine.id ? { ...line, selections, quantity, remarks } : line)),
    )
    setEditingLine(null)
  }

  function handleDeleteLine() {
    if (!editingLine) return
    setCart((prev) => prev.filter((line) => line.id !== editingLine.id))
    setEditingLine(null)
  }

  function handleFulfillmentSelect(type: FulfillmentType) {
    setFulfillmentType(type)
    if (type === 'pickup') {
      setFulfillment({ type: 'pickup' })
      setScreen('timeslot')
    } else {
      setScreen('zone')
    }
  }

  function handleZoneConfirm(zone: DeliveryZone, address: DeliveryAddress, lat: number | null, lng: number | null) {
    setFulfillment({ type: 'delivery', zoneName: zone.name, zoneAutoRoute: zone.auto_route, address, lat, lng })
    setScreen('timeslot')
  }

  function handleSlotConfirm(chosenSlot: string) {
    setSlot(chosenSlot)
    setScreen('payment')
  }

  function handlePaymentConfirm(input: PaymentInput) {
    setPayment(input)
    setScreen('customerInfo')
  }

  async function handleSubmit(name: string, contact: string) {
    if (!fulfillment || !slot || !payment) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitOnlineOrder({
        lines: cart,
        fulfillment,
        requestedTimeIso: slotToIso(slot, now),
        payment,
        customerName: name,
        customerContact: contact,
      })
      setScreen('confirmation')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong placing your order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleNewOrder() {
    setCart([])
    setFulfillmentType(null)
    setFulfillment(null)
    setSlot(null)
    setPayment(null)
    setSubmitError(null)
    setScreen('menu')
  }

  if (!isSupabaseConfigured) {
    return (
      <PageShell>
        <p className="text-body-md text-on-surface-variant">Online ordering is temporarily unavailable. Please try again later.</p>
      </PageShell>
    )
  }

  if (loadError) {
    return (
      <PageShell>
        <p className="text-body-md text-error">{loadError}</p>
      </PageShell>
    )
  }

  if (!settings || !menu) {
    return (
      <PageShell>
        <p className="text-body-md text-on-surface-variant">Loading…</p>
      </PageShell>
    )
  }

  // Closed takes over the whole page regardless of step — except mid-submit (the
  // submit itself re-checks and fails gracefully) and the confirmation screen for an
  // order that already went through.
  if (openState && !openState.open && screen !== 'confirmation' && !submitting) {
    return (
      <PageShell settings={settings}>
        <ClosedNotice state={openState} />
      </PageShell>
    )
  }

  const editingProduct = editingLine?.product ?? null
  const progress = orderProgressFor(screen, fulfillmentType)

  return (
    <PageShell settings={settings} progress={progress}>
      {screen === 'menu' && (
        <>
          <MenuBrowser categories={menu.categories} products={menu.products} onSelect={setAddModalProduct} />
          <div className="fixed inset-x-0 bottom-0 flex justify-center p-sm">
            <Button variant="primary" size="lg" onClick={() => setCartSheetOpen(true)}>
              🛒 View Cart ({cart.length})
            </Button>
          </div>
        </>
      )}

      {screen === 'fulfillment' && <FulfillmentStep onSelect={handleFulfillmentSelect} onBack={() => setScreen('menu')} />}

      {screen === 'zone' && (
        <DeliveryZoneStep
          zones={settings.delivery_zones}
          onConfirm={handleZoneConfirm}
          onBack={() => setScreen('fulfillment')}
        />
      )}

      {screen === 'timeslot' && (
        <TimeSlotStep
          slots={timeSlots}
          title={fulfillmentType === 'delivery' ? 'When should we deliver?' : 'When will you pick up?'}
          onConfirm={handleSlotConfirm}
          onBack={() => setScreen(fulfillmentType === 'delivery' ? 'zone' : 'fulfillment')}
        />
      )}

      {screen === 'payment' && (
        <PaymentStep
          amountDue={cartTotal(cart)}
          settings={settings}
          onConfirm={handlePaymentConfirm}
          onBack={() => setScreen('timeslot')}
        />
      )}

      {screen === 'customerInfo' && fulfillment && slot && payment && (
        <CustomerInfoStep
          lines={cart}
          fulfillment={fulfillment}
          slot={slot}
          payment={payment}
          submitting={submitting}
          submitError={submitError}
          onSubmit={handleSubmit}
          onBack={() => setScreen('payment')}
        />
      )}

      {screen === 'confirmation' && <OrderConfirmation onNewOrder={handleNewOrder} />}

      <CartSheet
        open={cartSheetOpen}
        lines={cart}
        onClose={() => setCartSheetOpen(false)}
        onLineTap={(line) => {
          setCartSheetOpen(false)
          setEditingLine(line)
        }}
        onCheckout={() => {
          setCartSheetOpen(false)
          setScreen('fulfillment')
        }}
      />

      {addModalProduct && (
        <CustomerLineModal
          open
          product={addModalProduct}
          modifierGroups={menu.modifierGroups}
          modifierOptions={menu.modifierOptions}
          mode="add"
          onClose={() => setAddModalProduct(null)}
          onConfirm={handleAddConfirm}
        />
      )}

      {editingLine && editingProduct && (
        <CustomerLineModal
          open
          product={editingProduct}
          modifierGroups={menu.modifierGroups}
          modifierOptions={menu.modifierOptions}
          mode="edit"
          initialSelectionIds={editingLine.selections.map((s) => s.id)}
          initialQuantity={editingLine.quantity}
          initialRemarks={editingLine.remarks}
          onClose={() => setEditingLine(null)}
          onConfirm={handleEditConfirm}
          onDelete={handleDeleteLine}
        />
      )}
    </PageShell>
  )
}
