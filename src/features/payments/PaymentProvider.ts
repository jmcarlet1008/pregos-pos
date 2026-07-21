import type { PaymentMethod, PaymentStatus } from '../../db'

export interface PaymentSession {
  sessionId: string
  amount: number
  qrCodeUrl: string | null
}

export type PaymentResultStatus = 'confirmed' | 'pending' | 'failed'

export interface PaymentResult {
  sessionId: string
  status: PaymentResultStatus
  reference: string | null
}

// Future-ready payment abstraction (plan.md Phase 3 / Phase 7)
export interface PaymentProvider {
  initiate(amount: number): Promise<PaymentSession>
  verify(sessionId: string): Promise<PaymentResult>
}

/** Payload needed to record a completed Payment against an order, regardless of which provider produced it. */
export interface CompletedPaymentInput {
  method: PaymentMethod
  amount_tendered: number
  change: number
  gcash_reference: string | null
  status: PaymentStatus
}