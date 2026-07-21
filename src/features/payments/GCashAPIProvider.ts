import type { PaymentProvider, PaymentResult, PaymentSession } from './PaymentProvider'

/**
 * Stub for a live GCash Pay / PayMongo integration (plan.md Phase 7).
 * Swap this in for ManualGCashProvider once a merchant account + webhook are ready —
 * checkout, orders, and inventory don't need to change.
 */
export class GCashAPIProvider implements PaymentProvider {
  async initiate(_amount: number): Promise<PaymentSession> {
    throw new Error('GCashAPIProvider is not implemented yet. Use ManualGCashProvider until Phase 7.')
  }

  async verify(_sessionId: string): Promise<PaymentResult> {
    throw new Error('GCashAPIProvider is not implemented yet. Use ManualGCashProvider until Phase 7.')
  }
}