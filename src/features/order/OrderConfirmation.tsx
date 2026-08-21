import { Button } from '../../components/ui'

export interface OrderConfirmationProps {
  onNewOrder: () => void
}

export function OrderConfirmation({ onNewOrder }: OrderConfirmationProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-md py-xl text-center">
      <span className="text-6xl">🎉</span>
      <h2 className="text-headline-md text-on-surface">Order received!</h2>
      <p className="max-w-sm text-body-md text-on-surface-variant">
        Thanks for your order. We'll get started on it and reach out on the contact number you gave us if we have any
        questions.
      </p>
      <Button variant="primary" onClick={onNewOrder}>
        Place Another Order
      </Button>
    </div>
  )
}
