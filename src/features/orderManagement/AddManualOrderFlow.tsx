import { useState } from 'react'
import type { BusinessSettings, Category, DeliveryAddress, DeliveryZone, FulfillmentType, ModifierOption, Product } from '../../db'
import { Button } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { generateTimeSlots, slotToIso } from '../order/businessHours'
import { cartTotal, type CartLine } from '../order/cartTypes'
import { CustomerInfoStep } from '../order/CustomerInfoStep'
import { DeliveryZoneStep } from '../order/DeliveryZoneStep'
import { FulfillmentStep } from '../order/FulfillmentStep'
import type { Fulfillment, PaymentInput } from '../order/orderSupabaseData'
import { PaymentStep } from '../order/PaymentStep'
import { TimeSlotStep } from '../order/TimeSlotStep'
import { CategoryTabs } from '../register/CategoryTabs'
import { ProductGrid } from '../register/ProductGrid'
import { ProductOptionsModal } from '../register/ProductOptionsModal'
import { createManualOrder } from './orderManagementSupabaseData'

type Screen = 'menu' | 'fulfillment' | 'zone' | 'timeslot' | 'payment' | 'customerInfo'

function id() {
  return crypto.randomUUID()
}

export interface AddManualOrderFlowProps {
  settings: BusinessSettings
  categories: Category[]
  products: Product[]
  /** Manager/cashier entering this order over the phone — attributed as user_id and StockAdjustment.created_by. */
  userId: string | null
  onClose: () => void
  onCreated: (orderId: string) => void
}

/**
 * Full-page overlay for phone/manual orders — a "New Order" button, not a route, so it
 * shares Order Management's Dexie-booted app shell rather than duplicating a second
 * unauthenticated page. Reuses the exact step components /order's customer wizard uses
 * (FulfillmentStep/DeliveryZoneStep/TimeSlotStep/PaymentStep/CustomerInfoStep — plain
 * props, no changes needed) for the fulfillment/zone/timeslot/payment/customer-info
 * steps, and Register's Dexie-aware ProductGrid/ProductOptionsModal/CategoryTabs (not
 * /order's Dexie-free MenuBrowser/CustomerLineModal, which exist specifically because
 * /order must avoid Dexie — a constraint that doesn't apply here) for the product
 * picker. Submits via createManualOrder, tagged channel: 'phone'.
 */
export function AddManualOrderFlow({ settings, categories, products, userId, onClose, onCreated }: AddManualOrderFlowProps) {
  const [screen, setScreen] = useState<Screen>('menu')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [addModalProduct, setAddModalProduct] = useState<Product | null>(null)
  const [editingLine, setEditingLine] = useState<CartLine | null>(null)

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType | null>(null)
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [payment, setPayment] = useState<PaymentInput | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const now = new Date()
  const timeSlots = generateTimeSlots(settings, now)

  const activeCategories = categories.filter((c) => c.active && !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order)
  const activeProducts = products.filter((p) => p.active && !p.deleted_at).sort((a, b) => a.sort_order - b.sort_order)
  const visibleProducts = categoryId ? activeProducts.filter((p) => p.category_id === categoryId) : activeProducts

  function handleAddConfirm(selections: ModifierOption[], quantity: number) {
    if (!addModalProduct) return
    setCart((prev) => [...prev, { id: id(), product: addModalProduct, selections, quantity, remarks: null }])
    setAddModalProduct(null)
  }

  function handleEditConfirm(selections: ModifierOption[], quantity: number) {
    if (!editingLine) return
    setCart((prev) => prev.map((line) => (line.id === editingLine.id ? { ...line, selections, quantity } : line)))
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
      const orderId = await createManualOrder({
        lines: cart,
        fulfillment,
        requestedTimeIso: slotToIso(slot, now),
        payment,
        customerName: name,
        customerContact: contact,
        userId,
      })
      onCreated(orderId)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong creating the order.')
    } finally {
      setSubmitting(false)
    }
  }

  const editingProduct = editingLine?.product ?? null

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-surface">
      <header className="flex min-h-touch shrink-0 items-center justify-between border-b border-surface-dim bg-surface-container-lowest px-md py-sm">
        <span className="text-headline-md text-on-surface">📞 Add Manual Order</span>
        <Button variant="ghost" onClick={onClose}>
          ✕ Close
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-md p-md">
        {screen === 'menu' && (
          <>
            <CategoryTabs categories={activeCategories} selectedId={categoryId} onSelect={setCategoryId} />
            <div className="@container min-h-0 flex-1 overflow-y-auto pr-xs">
              <ProductGrid products={visibleProducts} onSelect={setAddModalProduct} />
            </div>
            <div className="flex items-center justify-between gap-sm border-t border-surface-dim pt-sm">
              <span className="text-body-lg font-bold text-on-surface">
                {cart.length} item{cart.length === 1 ? '' : 's'} · {formatCurrency(cartTotal(cart))}
              </span>
              <Button variant="primary" size="lg" disabled={cart.length === 0} onClick={() => setScreen('fulfillment')}>
                Continue →
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
            title={fulfillmentType === 'delivery' ? 'When should we deliver?' : 'When will they pick up?'}
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
      </div>

      {addModalProduct && (
        <ProductOptionsModal
          open
          product={addModalProduct}
          mode="add"
          onClose={() => setAddModalProduct(null)}
          onConfirm={handleAddConfirm}
        />
      )}

      {editingLine && editingProduct && (
        <ProductOptionsModal
          open
          product={editingProduct}
          mode="edit"
          initialSelectionIds={editingLine.selections.map((s) => s.id)}
          initialQuantity={editingLine.quantity}
          onClose={() => setEditingLine(null)}
          onConfirm={handleEditConfirm}
          onDelete={handleDeleteLine}
        />
      )}
    </div>
  )
}
