import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'npm:stripe@14'

import { handleDispute, handleChargeRefunded } from './handlers/charges.ts'
import { handleCheckoutCompleted } from './handlers/checkout.ts'
import { handleCustomerUpdated } from './handlers/customers.ts'
import {
  handleInvoiceActionRequired,
  handleInvoiceFinalized,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleInvoiceVoided,
} from './handlers/invoices.ts'
import {
  handleScheduleEnded,
  handleSubscriptionChange,
} from './handlers/subscriptions.ts'
import { stripe, supabase } from './lib/clients.ts'
import { type PendingInviteJob, runPendingInvites } from './lib/invites.ts'

/**
 * Stripe webhook: verifies the signature, claims the event once (`stripe_events`), hands
 * it to its handler, and releases the claim on any failure so Stripe retries.
 *
 * Only checkout returns something - the sign-up invitations to send after billing is
 * recorded. Event types not listed here are acknowledged and ignored.
 */
type Handler = (event: Stripe.Event) => Promise<PendingInviteJob | null | void>

const HANDLERS: Record<string, Handler> = {
  'checkout.session.completed': handleCheckoutCompleted,

  'invoice.paid': handleInvoicePaid,
  'invoice.payment_succeeded': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
  'invoice.finalized': handleInvoiceFinalized,
  'invoice.payment_action_required': handleInvoiceActionRequired,
  'invoice.voided': handleInvoiceVoided,
  'invoice.marked_uncollectible': handleInvoiceVoided,

  'charge.refunded': handleChargeRefunded,
  'charge.dispute.created': handleDispute,
  'charge.dispute.closed': handleDispute,

  'customer.subscription.updated': handleSubscriptionChange,
  'customer.subscription.deleted': handleSubscriptionChange,
  'subscription_schedule.released': handleScheduleEnded,
  'subscription_schedule.canceled': handleScheduleEnded,

  'customer.updated': handleCustomerUpdated,
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      stripe.webhooks.subtleCrypto
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 })
  }

  const { error: claimError } = await supabase.from('stripe_events').insert({
    event_id: event.id,
    type: event.type,
    processed_at: new Date().toISOString(),
  })

  if (claimError) {
    if (claimError.code === '23505') {
      return new Response('Event already processed', { status: 200 })
    }
    console.error('Could not claim event:', claimError.message)
    return new Response('Could not claim event', { status: 500 })
  }

  // Deferred until AFTER the billing writes below. Redeeming invites used to run first,
  // and it threw on every failure — so one bad invitation stopped the subscription row
  // from ever recording its customer id, payment intent and card details, even though
  // the payment itself had succeeded. Billing state is what the app reads; it must not
  // depend on whether an email went out.
  let pendingInviteJob: PendingInviteJob | null = null

  try {
    const handler = HANDLERS[event.type]
    if (handler) pendingInviteJob = (await handler(event)) ?? null

    if (pendingInviteJob) await runPendingInvites(pendingInviteJob)

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err)
    console.error('HANDLER ERROR:', err)

    const { error: releaseError } = await supabase
      .from('stripe_events')
      .delete()
      .eq('event_id', event.id)

    if (releaseError) {
      console.error(
        `Could not release claim on ${event.id} — it will NOT be retried:`,
        releaseError.message
      )
    }

    return new Response(`Handler Error: ${errMessage}`, { status: 500 })
  }
})
