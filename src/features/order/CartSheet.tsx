import { Button, Modal } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { cartLineTotal, cartTotal, type CartLine } from './cartTypes'

export interface CartSheetProps {
  open: boolean
  lines: CartLine[]
  onClose: () => void
  onLineTap: (line: CartLine) => void
  onCheckout: () => void
}

export function CartSheet({ open, lines, onClose, onLineTap, onCheckout }: CartSheetProps) {
  return (
    <Modal open={open} onClose={onClose} title="Your Order">
      <div className="flex flex-col gap-md">
        {lines.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">Your cart is empty. Tap a product to add it.</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {lines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  onClick={() => onLineTap(line)}
                  className="w-full rounded-md border border-surface-dim px-sm py-xs text-left hover:border-primary hover:bg-surface-container"
                >
                  <div className="flex items-start justify-between gap-sm">
                    <span className="text-body-md font-bold text-on-surface">
                      {line.quantity}× {line.product.name}
                    </span>
                    <span className="shrink-0 text-body-md font-bold text-on-surface">
                      {formatCurrency(cartLineTotal(line))}
                    </span>
                  </div>
                  {line.selections.length > 0 && (
                    <ul className="mt-[2px] flex flex-col">
                      {line.selections.map((option) => (
                        <li key={option.id} className="text-label-sm text-on-surface-variant">
                          + {option.name}
                          {option.price_adjustment > 0 ? ` (${formatCurrency(option.price_adjustment)})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {line.remarks && (
                    <p className="mt-[2px] text-label-sm italic text-on-surface-variant">“{line.remarks}”</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-surface-dim pt-sm">
          <span className="text-headline-md text-on-surface">Total</span>
          <span className="text-headline-md text-primary">{formatCurrency(cartTotal(lines))}</span>
        </div>
        <Button variant="primary" size="lg" fullWidth disabled={lines.length === 0} onClick={onCheckout}>
          Checkout
        </Button>
      </div>
    </Modal>
  )
}
