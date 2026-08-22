import { BagIcon, Button, DragHandleIcon, ScooterIcon, WalkInIcon, type DragHandleProps } from '../../components/ui'
import type { BusinessSettings, Order, OrderLine, OrderLineModifier } from '../../db'
import { formatCurrency } from '../../lib/currency'
import {
  formatDeliveryAddress,
  formatPhase,
  getEffectivePrepMinutes,
  getFulfillmentKind,
  getStartByDate,
  getUrgency,
  type FulfillmentKind,
  type Urgency,
} from '../../lib/orderWorkflow'

const FULFILLMENT_LABEL: Record<FulfillmentKind, string> = {
  'walk-in': 'Walk-in',
  pickup: 'Pickup',
  delivery: 'Delivery',
}

const FULFILLMENT_ICON: Record<FulfillmentKind, typeof WalkInIcon> = {
  'walk-in': WalkInIcon,
  pickup: BagIcon,
  delivery: ScooterIcon,
}

const URGENCY_CLASSES: Record<Urgency, string> = {
  urgent: 'bg-error-container text-on-error-container',
  soon: 'bg-warning-container text-on-warning-container',
  ok: 'bg-success-container text-on-success-container',
}

const URGENCY_DOT: Record<Urgency, string> = { urgent: '🔴', soon: '🟡', ok: '🟢' }

/** Bold, non-theme colors (same reasoning as /fulfillment's column headers) — the goal
 *  is a badge that pops enough to catch the eye at a glance across several cards, not
 *  one that blends into the app's usual Material-token palette. */
const PHASE_BADGE_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-emerald-700',
  'bg-amber-600',
  'bg-pink-600',
  'bg-cyan-700',
  'bg-indigo-600',
  'bg-rose-600',
]

/** Same phase string always gets the same color, across every card — that's what lets
 *  staff spot "these two are going to the same place" without reading each address. */
function colorForPhase(phase: string): string {
  let hash = 0
  for (let i = 0; i < phase.length; i++) hash = (hash * 31 + phase.charCodeAt(i)) >>> 0
  return PHASE_BADGE_COLORS[hash % PHASE_BADGE_COLORS.length]
}

/** Only a structured delivery address has a distinct phase field — a freeform address
 *  is one free-text area string with nothing to pull out on its own. Runs the same
 *  formatPhase() normalization as the full address line, so "2" and "Phase 2" from two
 *  different customers still match colors as the same phase instead of two different ones. */
function getDeliveryPhase(order: Order): string | null {
  const address = order.delivery_address
  return address?.type === 'structured' && address.phase ? formatPhase(address.phase) : null
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatMinutesFromNow(target: Date, now: Date): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60_000)
  return diffMin <= 0 ? 'now' : `in ${diffMin} min`
}

interface PrepTimeControlProps {
  effectiveMinutes: number
  isOverridden: boolean
  onChange: (minutes: number | null) => void
}

/** Compact ±5 min stepper — the "per-order prep time override" hook, usable both when
 *  confirming a bigger/more complex order and later, if kitchen realizes mid-prep it's running long. */
function PrepTimeControl({ effectiveMinutes, isOverridden, onChange }: PrepTimeControlProps) {
  return (
    <div className="flex items-center gap-xs text-label-bold text-on-surface-variant">
      <span>
        Prep: {effectiveMinutes} min{isOverridden ? ' (custom)' : ''}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.max(5, effectiveMinutes - 5))}
        aria-label="Decrease prep time by 5 minutes"
        className="touch-target flex shrink-0 items-center justify-center rounded-full text-body-lg font-bold text-on-surface hover:bg-surface-container"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => onChange(effectiveMinutes + 5)}
        aria-label="Increase prep time by 5 minutes"
        className="touch-target flex shrink-0 items-center justify-center rounded-full text-body-lg font-bold text-on-surface hover:bg-surface-container"
      >
        +
      </button>
      {isOverridden && (
        <button type="button" onClick={() => onChange(null)} className="text-label-sm font-bold text-primary underline">
          Use default
        </button>
      )}
    </div>
  )
}

export interface KitchenOrderCardProps {
  order: Order
  lines: OrderLine[]
  modifiersByLineId: Map<string, OrderLineModifier[]>
  settings: BusinessSettings
  /** Ticks ~every 30s from the page — not recomputed per-card on every render. */
  now: Date
  variant: 'preparing' | 'pending-confirmation'
  /** Omitted for pending-confirmation cards — that section isn't draggable. */
  dragHandle?: DragHandleProps
  onMarkReady?: () => void
  onConfirm?: () => void
  onPrepTimeChange?: (minutes: number | null) => void
}

export function KitchenOrderCard({
  order,
  lines,
  modifiersByLineId,
  settings,
  now,
  variant,
  dragHandle,
  onMarkReady,
  onConfirm,
  onPrepTimeChange,
}: KitchenOrderCardProps) {
  const kind = getFulfillmentKind(order)
  const urgency = getUrgency(order, settings, now)
  const startBy = getStartByDate(order, settings)
  const effectiveMinutes = getEffectivePrepMinutes(order, settings)
  const FulfillmentIcon = FULFILLMENT_ICON[kind]
  const manuallyPrioritized = order.queue_priority != null
  const deliveryPhase = kind === 'delivery' ? getDeliveryPhase(order) : null

  return (
    <div className="flex gap-sm rounded-lg border border-surface-dim bg-surface-container-lowest p-md">
      {dragHandle && (
        <button
          type="button"
          {...dragHandle.attributes}
          {...dragHandle.listeners}
          aria-label="Drag to reorder"
          className="touch-target flex shrink-0 cursor-grab items-center justify-center text-on-surface-variant"
        >
          <DragHandleIcon />
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-sm">
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <div className="flex flex-wrap items-center gap-sm">
            <span className="text-headline-md text-on-surface">#{order.order_number ?? '—'}</span>
            <span className="flex items-center gap-xs rounded-full bg-surface-container px-sm py-xs text-label-bold text-on-surface">
              <FulfillmentIcon width={16} height={16} />
              {FULFILLMENT_LABEL[kind]}
              {kind === 'delivery' && order.delivery_zone ? ` · ${order.delivery_zone}` : ''}
            </span>
            {deliveryPhase && (
              // Same color every time this exact phase string appears on any card — lets
              // staff spot same-phase deliveries to batch-cook at a glance, not by reading.
              <span className={`rounded-full px-sm py-xs text-label-bold text-white ${colorForPhase(deliveryPhase)}`}>
                📍 {deliveryPhase}
              </span>
            )}
            {manuallyPrioritized && (
              <span className="rounded bg-primary-container px-xs py-[2px] text-label-sm font-bold text-on-primary-container">
                Manually prioritized
              </span>
            )}
          </div>

          {variant === 'preparing' && (
            <span className={`rounded-md px-sm py-xs text-label-bold ${URGENCY_CLASSES[urgency]}`}>
              {URGENCY_DOT[urgency]}{' '}
              {kind === 'walk-in'
                ? 'Waiting now'
                : urgency === 'urgent' || !startBy
                  ? 'Start now'
                  : `Start by ${formatTime(startBy.toISOString())} (${formatMinutesFromNow(startBy, now)})`}
            </span>
          )}
        </div>

        {kind !== 'walk-in' && order.customer_name && (
          <div className="text-body-md font-bold text-on-surface">👤 {order.customer_name}</div>
        )}

        {kind === 'delivery' && order.delivery_address && (
          <div className="text-body-md text-on-surface-variant">📍 {formatDeliveryAddress(order.delivery_address)}</div>
        )}

        <div className="flex flex-col gap-xs">
          {lines.map((line) => (
            <div key={line.id}>
              <div className="text-body-lg font-bold text-on-surface">
                <span className="text-primary">{line.quantity}×</span> {line.product_name}
              </div>
              {(modifiersByLineId.get(line.id) ?? []).map((mod) => (
                <div key={mod.id} className="pl-md text-body-md text-on-surface-variant">
                  + {mod.name}
                </div>
              ))}
              {line.remarks && <div className="pl-md text-body-md italic text-on-surface-variant">"{line.remarks}"</div>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-sm border-t border-dashed border-surface-dim pt-xs text-label-bold text-on-surface-variant">
          <span>Received {formatTime(order.created_at)}</span>
          {order.requested_time && <span>Requested {formatTime(order.requested_time)}</span>}
          <span>{formatCurrency(order.total)}</span>
          <span>
            {order.payment_method === 'gcash'
              ? `GCash${order.gcash_customer_confirmed ? ' ✓' : ''}`
              : order.cash_tendered_amount != null
                ? `Cash · ${formatCurrency(order.cash_tendered_amount)} tendered`
                : 'Cash'}
          </span>
        </div>

        {onPrepTimeChange && (
          <PrepTimeControl
            effectiveMinutes={effectiveMinutes}
            isOverridden={order.prep_time_override_minutes != null}
            onChange={onPrepTimeChange}
          />
        )}

        {(onConfirm || onMarkReady) && (
          <div className="flex justify-end">
            {variant === 'pending-confirmation' && onConfirm && (
              <Button variant="primary" size="lg" onClick={onConfirm}>
                Confirm &amp; Send to Kitchen
              </Button>
            )}
            {variant === 'preparing' && onMarkReady && (
              <Button variant="primary" size="lg" onClick={onMarkReady}>
                Mark Ready
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
