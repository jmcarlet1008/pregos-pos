import { Button } from '../../components/ui'
import type { FulfillmentType } from '../../db'

export interface FulfillmentStepProps {
  onSelect: (type: FulfillmentType) => void
  onBack: () => void
}

export function FulfillmentStep({ onSelect, onBack }: FulfillmentStepProps) {
  return (
    <div className="flex flex-col gap-md">
      <h2 className="text-headline-md text-on-surface">How would you like your order?</h2>
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <Button variant="secondary" size="lg" onClick={() => onSelect('pickup')}>
          🏠 Pickup
        </Button>
        <Button variant="secondary" size="lg" onClick={() => onSelect('delivery')}>
          🛵 Delivery
        </Button>
      </div>
      <Button variant="ghost" onClick={onBack}>
        ← Back to cart
      </Button>
    </div>
  )
}
