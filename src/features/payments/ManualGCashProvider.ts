import { GCASH_QR_IMAGE_URL } from './config'
import type { PaymentProvider, PaymentResult, PaymentResultStatus, PaymentSession } from './PaymentProvider'

interface ManualSession {
  amount: number
  status: PaymentResultStatus
  reference: string | null
}

/**
 * Manual GCash flow: no live API call. The cashier confirms in-person that the
 * customer's GCash app shows a completed transfer, optionally records the
 * reference number, and that confirmation stands in for a webhook callback.
 */
export class ManualGCashProvider implements PaymentProvider {
  private sessions = new Map<string, ManualSession>()

  async initiate(amount: number): Promise<PaymentSession> {
    const sessionId = crypto.randomUUID()
    this.sessions.set(sessionId, { amount, status: 'pending', reference: null })
    return { sessionId, amount, qrCodeUrl: GCASH_QR_IMAGE_URL }
  }

  /** Staff-driven confirmation — the manual equivalent of a payment webhook. */
  async confirm(sessionId: string, reference: string | null): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Unknown GCash payment session.')
    session.status = 'confirmed'
    session.reference = reference
  }

  async verify(sessionId: string): Promise<PaymentResult> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Unknown GCash payment session.')
    this.sessions.delete(sessionId)
    return { sessionId, status: session.status, reference: session.reference }
  }
}

export const manualGCashProvider = new ManualGCashProvider()