import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { db, type ModifierOption, type PaymentMethod, type Product } from '../../db'
import { Button, Modal } from '../../components/ui'
import { useAuth } from '../auth/AuthContext'
import { CategoryTabs } from './CategoryTabs'
import { ProductGrid } from './ProductGrid'
import { CartPanel, type CartLineWithModifiers } from './CartPanel'
import { ProductOptionsModal } from './ProductOptionsModal'
import { HeldOrdersModal } from './HeldOrdersModal'
import { CheckoutScreen } from './CheckoutScreen'
import { ReceiptScreen } from './ReceiptScreen'
import { OrderHistoryPage } from './OrderHistoryPage'
import { PaymentScreen } from '../payments/PaymentScreen'
import type { CompletedPaymentInput } from '../payments/PaymentProvider'
import { OUT_OF_STOCK_MODE } from './config'
import { addOrderLine, createOrder, deleteOrderIfEmpty, deleteOrderLine, incrementSimpleLine, stockStatus, updateOrderLine } from './registerData'
import { completeOrder } from './checkoutData'
import { vibrate } from '../../lib/haptics'

const STORAGE_KEY = 'pregos-pos:register:current-order-id'

type Screen = 'menu' | 'history' | 'checkout' | 'payment' | 'receipt'

export function RegisterPage() {
  const { user } = useAuth()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const [addModalProduct, setAddModalProduct] = useState<Product | null>(null)
  const [editingLine, setEditingLine] = useState<CartLineWithModifiers | null>(null)
  const [heldModalOpen, setHeldModalOpen] = useState(false)
  const [pendingOutOfStock, setPendingOutOfStock] = useState<Product | null>(null)
  const [blockedProduct, setBlockedProduct] = useState<Product | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null)

  const initRan = useRef(false)
  useEffect(() => {
    if (initRan.current) return
    initRan.current = true

    async function init() {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const existing = await db.orders.get(stored)
        if (existing && existing.status === 'active') {
          setCurrentOrderId(stored)
          return
        }
      }
      const newId = await createOrder()
      sessionStorage.setItem(STORAGE_KEY, newId)
      setCurrentOrderId(newId)
    }

    void init()
  }, [])

  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const activeCategories = categories.filter((c) => c.active).sort((a, b) => a.sort_order - b.sort_order)

  const products = useLiveQuery(() => db.products.toArray()) ?? []
  const activeProducts = products.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order)
  const visibleProducts = selectedCategoryId
    ? activeProducts.filter((p) => p.category_id === selectedCategoryId)
    : activeProducts

  const currentOrder = useLiveQuery(
    () => (currentOrderId ? db.orders.get(currentOrderId) : undefined),
    [currentOrderId],
  )

  const activeOrders = useLiveQuery(() => db.orders.where('status').equals('active').toArray()) ?? []
  const heldOrders = activeOrders
    .filter((o) => o.id !== currentOrderId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const hasUnfinishedOrder = screen !== 'receipt' && (currentOrder?.total ?? 0) > 0

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnfinishedOrder) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnfinishedOrder])

  const navBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnfinishedOrder && currentLocation.pathname !== nextLocation.pathname,
  )

  async function switchCurrentOrder(newOrderId: string) {
    const previousId = currentOrderId
    setCurrentOrderId(newOrderId)
    sessionStorage.setItem(STORAGE_KEY, newOrderId)
    if (previousId && previousId !== newOrderId) {
      await deleteOrderIfEmpty(previousId)
    }
  }

  async function handleHold() {
    const newId = await createOrder()
    await switchCurrentOrder(newId)
  }

  async function handleResume(orderId: string) {
    setHeldModalOpen(false)
    await switchCurrentOrder(orderId)
  }

  async function openAddFlow(product: Product) {
    if (!currentOrderId) return
    const groupCount = await db.modifierGroups.where('product_id').equals(product.id).count()
    if (groupCount > 0) {
      setAddModalProduct(product)
      return
    }
    vibrate('tap')
    const merged = await incrementSimpleLine(currentOrderId, product.id)
    if (!merged) {
      await addOrderLine(currentOrderId, product, [], 1)
    }
  }

  function handleProductTap(product: Product) {
    if (stockStatus(product) === 'out') {
      if (OUT_OF_STOCK_MODE === 'block') {
        setBlockedProduct(product)
      } else {
        setPendingOutOfStock(product)
      }
      return
    }
    void openAddFlow(product)
  }

  async function confirmOutOfStockAdd() {
    const product = pendingOutOfStock
    setPendingOutOfStock(null)
    if (product) await openAddFlow(product)
  }

  async function handleAddConfirm(selections: ModifierOption[], quantity: number) {
    if (!currentOrderId || !addModalProduct) return
    await addOrderLine(currentOrderId, addModalProduct, selections, quantity)
    setAddModalProduct(null)
  }

  async function handleEditConfirm(selections: ModifierOption[], quantity: number) {
    if (!editingLine) return
    await updateOrderLine(editingLine.id, selections, quantity)
    setEditingLine(null)
  }

  async function handleDeleteLine() {
    if (!editingLine) return
    await deleteOrderLine(editingLine.id)
    setEditingLine(null)
  }

  function handlePay(method: PaymentMethod) {
    setPaymentMethod(method)
    setScreen('payment')
  }

  async function handlePaymentSubmit(input: CompletedPaymentInput) {
    if (!currentOrderId) return
    setSubmittingPayment(true)
    try {
      await completeOrder(currentOrderId, input, user?.id ?? null)
      vibrate('success')
      sessionStorage.removeItem(STORAGE_KEY)
      setCompletedOrderId(currentOrderId)
      setCurrentOrderId(null)
      setScreen('receipt')
    } finally {
      setSubmittingPayment(false)
    }
  }

  async function handleNewOrder() {
    const newId = await createOrder()
    sessionStorage.setItem(STORAGE_KEY, newId)
    setCurrentOrderId(newId)
    setCompletedOrderId(null)
    setScreen('menu')
  }

  const editingProduct = editingLine ? products.find((p) => p.id === editingLine.product_id) ?? null : null

  return (
    <>
      {(screen === 'menu' || screen === 'history') && (
        <div className="flex h-full flex-col gap-sm">
          <div className="flex gap-xs" role="tablist" aria-label="Register sections">
            <button
              type="button"
              role="tab"
              aria-selected={screen === 'menu'}
              onClick={() => setScreen('menu')}
              className={[
                'touch-target shrink-0 whitespace-nowrap rounded-full px-md text-body-md font-body font-bold transition-colors',
                screen === 'menu'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
              ].join(' ')}
            >
              Order
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={screen === 'history'}
              onClick={() => setScreen('history')}
              className={[
                'touch-target shrink-0 whitespace-nowrap rounded-full px-md text-body-md font-body font-bold transition-colors',
                screen === 'history'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
              ].join(' ')}
            >
              History
            </button>
          </div>

          {screen === 'menu' ? (
            <div className="flex min-h-0 flex-1 gap-md">
              <div className="flex min-w-0 flex-1 flex-col gap-sm">
                <CategoryTabs categories={activeCategories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
                <div className="@container min-h-0 flex-1 overflow-y-auto pr-xs">
                  <ProductGrid products={visibleProducts} onSelect={handleProductTap} />
                </div>
              </div>

              <CartPanel
                order={currentOrder}
                onLineTap={setEditingLine}
                onCheckout={() => setScreen('checkout')}
                onHold={handleHold}
                onOpenHeld={() => setHeldModalOpen(true)}
                heldCount={heldOrders.length}
              />
            </div>
          ) : (
            <OrderHistoryPage />
          )}
        </div>
      )}

      {screen === 'checkout' && (
        <CheckoutScreen
          order={currentOrder}
          onLineTap={setEditingLine}
          onAddItem={() => setScreen('menu')}
          onPay={handlePay}
        />
      )}

      {screen === 'payment' && currentOrder && (
        <PaymentScreen
          orderNumber={currentOrder.order_number}
          amountDue={currentOrder.total}
          initialMethod={paymentMethod}
          submitting={submittingPayment}
          onBack={() => setScreen('checkout')}
          onSubmit={handlePaymentSubmit}
        />
      )}

      {screen === 'receipt' && completedOrderId && (
        <ReceiptScreen orderId={completedOrderId} onDone={handleNewOrder} />
      )}

      <HeldOrdersModal
        open={heldModalOpen}
        heldOrders={heldOrders}
        onResume={handleResume}
        onClose={() => setHeldModalOpen(false)}
      />

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
          initialSelectionIds={editingLine.modifiers.map((m) => m.modifier_option_id)}
          initialQuantity={editingLine.quantity}
          onClose={() => setEditingLine(null)}
          onConfirm={handleEditConfirm}
          onDelete={handleDeleteLine}
        />
      )}

      {pendingOutOfStock && (
        <Modal
          open
          onClose={() => setPendingOutOfStock(null)}
          title="Out of Stock"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingOutOfStock(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmOutOfStockAdd}>
                Add Anyway
              </Button>
            </>
          }
        >
          <p className="text-body-md text-on-surface">
            {pendingOutOfStock.name} is currently out of stock. Add it to the order anyway?
          </p>
        </Modal>
      )}

      {navBlocker.state === 'blocked' && (
        <Modal
          open
          onClose={() => navBlocker.reset?.()}
          title="Leave this order?"
          footer={
            <>
              <Button variant="secondary" onClick={() => navBlocker.reset?.()}>
                Stay
              </Button>
              <Button variant="danger" onClick={() => navBlocker.proceed?.()}>
                Leave Order
              </Button>
            </>
          }
        >
          <p className="text-body-md text-on-surface">
            Order #{currentOrder?.order_number ?? ''} has items but hasn't been paid yet. It'll stay saved as a held
            order — you can resume it later from "Held".
          </p>
        </Modal>
      )}

      {blockedProduct && (
        <Modal
          open
          onClose={() => setBlockedProduct(null)}
          title="Out of Stock"
          footer={
            <Button variant="primary" onClick={() => setBlockedProduct(null)}>
              OK
            </Button>
          }
        >
          <p className="text-body-md text-on-surface">
            {blockedProduct.name} is out of stock and can't be added to the order.
          </p>
        </Modal>
      )}
    </>
  )
}
