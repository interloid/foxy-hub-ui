import Stripe from 'npm:stripe@14'

import {
  declineReason,
  recordSubscriptionInvoice,
} from '../lib/billing-payments.ts'
import { logInvoicePaid } from '../lib/activity.ts'
import { supabase } from '../lib/clients.ts'
import { isoFromUnix, loadInvoice } from '../lib/util.ts'

/**
 * The invoice-first flow's settlement events.
 *
 * `checkout.session.completed` above still handles invoices paid the old way, where
 * the Stripe invoice was a by-product of Checkout. Here the invoice existed first
 * and the client paid it on its own hosted page, so there is no session — the
 * invoice itself reports the outcome.
 *
 * `invoice.payment_succeeded` fires alongside `invoice.paid` for card payments;
 * both are handled so neither ordering leaves the row unsettled, and the update is
 * written by id so a duplicate is a no-op rather than a second charge.
 */
export async function handleInvoicePaid(event: Stripe.Event) {
  const stripeInvoice = await loadInvoice(event)

  // The agency's own subscription (renewal, first payment, upgrade proration) -
  // recorded in billing_payments. Client invoices carry no subscription.
  if (stripeInvoice.subscription) {
    await recordSubscriptionInvoice(stripeInvoice, 'paid', event, {
      paid_at: isoFromUnix(
        stripeInvoice.status_transitions?.paid_at ?? event.created
      ),
      next_attempt_at: null,
    })
    return
  }

  // `metadata.invoice_id` is the app's own row, set when the invoice was issued.
  // Matching on it rather than on `stripe_invoice_id` alone means a row whose update
  // failed at issue time still settles correctly.
  const appInvoiceId = stripeInvoice.metadata?.invoice_id

  if (!appInvoiceId && !stripeInvoice.id) {
    console.warn('invoice event with nothing to match on:', event.id)
    return
  }

  const paymentIntent =
    typeof stripeInvoice.payment_intent === 'string'
      ? stripeInvoice.payment_intent
      : (stripeInvoice.payment_intent?.id ?? null)

  const settle = () => {
    const query = supabase.from('invoices').update({
      status: 'paid',
      paid_at: new Date(
        (stripeInvoice.status_transitions?.paid_at ??
          Math.floor(Date.now() / 1000)) * 1000
      ).toISOString(),
      payment_intent: paymentIntent,
      invoice_url: stripeInvoice.hosted_invoice_url,
      stripe_invoice_id: stripeInvoice.id,
    })
    return appInvoiceId
      ? query.eq('id', appInvoiceId)
      : query.eq('stripe_invoice_id', stripeInvoice.id)
  }

  // The first of the two events flips the row from unpaid to paid; only that one writes
  // the feed line. The filter makes it atomic, so two events in the same second can't both
  // claim it. The second event finds nothing unpaid and re-applies the same values below.
  const { data: newlyPaid, error: claimError } = await settle()
    .neq('status', 'paid')
    .select(
      'id, org_id, project_id, invoice_number, amount, currency, due_date'
    )

  if (claimError) {
    throw new Error(
      `Failed to settle invoice ${stripeInvoice.id}: ${claimError.message}`
    )
  }

  if (newlyPaid && newlyPaid.length > 0) {
    console.log(`Invoice ${newlyPaid[0].id} marked paid.`)
    await logInvoicePaid(newlyPaid[0])
    return
  }

  const { data: settled, error: settleError } = await settle().select('id')

  if (settleError) {
    throw new Error(
      `Failed to settle invoice ${stripeInvoice.id}: ${settleError.message}`
    )
  }

  if (!settled || settled.length === 0) {
    // Not fatal: a Stripe invoice raised outside this app (a subscription charge,
    // say) has no row here, and retrying would never find one.
    console.warn(`No app invoice matched ${stripeInvoice.id}`)
  } else {
    console.log(`Invoice ${settled[0].id} was already paid.`)
  }
}

/**
 * Subscription invoices: recorded as `failed`, with the decline reason and when
 * Stripe will try again - the billing page shows it and offers "Update card".
 *
 * Client invoices: a failed attempt is not a status change. The invoice stays `due`
 * or `overdue`, so the client can try again and the overdue cron keeps its own
 * schedule — writing a `failed` state here would need a status the enum does not
 * have, and would hide the fact that the money is still owed.
 */
export async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const stripeInvoice = await loadInvoice(event)
  if (stripeInvoice.subscription) {
    await recordSubscriptionInvoice(stripeInvoice, 'failed', event, {
      failed_at: isoFromUnix(event.created),
      ...(await declineReason(stripeInvoice)),
    })
    return
  }
  console.warn(
    `Payment failed for invoice ${stripeInvoice.id} (app: ${stripeInvoice.metadata?.invoice_id ?? 'unknown'})`
  )
}

// A subscription invoice is due - the first attempt is still to come.
export async function handleInvoiceFinalized(event: Stripe.Event) {
  const stripeInvoice = await loadInvoice(event)
  if (stripeInvoice.subscription && stripeInvoice.amount_due > 0) {
    await recordSubscriptionInvoice(stripeInvoice, 'pending', event)
  }
}

// The bank wants 3-D Secure. Stripe emails the customer a link to confirm.
export async function handleInvoiceActionRequired(event: Stripe.Event) {
  const stripeInvoice = await loadInvoice(event)
  if (stripeInvoice.subscription) {
    await recordSubscriptionInvoice(stripeInvoice, 'requires_action', event)
  }
}

// Nothing more is owed on it: voided, or written off after the last retry.
export async function handleInvoiceVoided(event: Stripe.Event) {
  const stripeInvoice = await loadInvoice(event)
  if (stripeInvoice.subscription) {
    await recordSubscriptionInvoice(stripeInvoice, 'void', event, {
      next_attempt_at: null,
    })
  }
}
