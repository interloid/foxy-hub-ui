import Stripe from 'npm:stripe@14'

import {
  type BillingPaymentStatus,
  updatePaymentForCharge,
} from '../lib/billing-payments.ts'
import { idOf, isoFromUnix } from '../lib/util.ts'

// A refund made in the Stripe dashboard (or by the API), full or partial.
export async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge
  const fullyRefunded =
    charge.refunded || charge.amount_refunded >= charge.amount_captured
  await updatePaymentForCharge(
    { chargeId: charge.id, paymentIntentId: idOf(charge.payment_intent) },
    event,
    {
      status: fullyRefunded ? 'refunded' : 'partially_refunded',
      amount_refunded_cents: charge.amount_refunded,
      refunded_at: isoFromUnix(event.created),
    }
  )
}

// A chargeback. Won (or closed with a warning only) puts the payment back to paid;
// lost means the money went back to the customer.
export async function handleDispute(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute
  const status: BillingPaymentStatus =
    event.type === 'charge.dispute.created'
      ? 'disputed'
      : dispute.status === 'lost'
        ? 'dispute_lost'
        : 'paid'
  await updatePaymentForCharge(
    {
      chargeId: idOf(dispute.charge),
      paymentIntentId: idOf(dispute.payment_intent),
    },
    event,
    { status }
  )
}
