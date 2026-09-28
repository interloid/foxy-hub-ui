import Stripe from 'npm:stripe@14'

import { recordSubscriptionInvoice } from '../lib/billing-payments.ts'
import { stripe, supabase } from '../lib/clients.ts'
import type { PendingInviteJob } from '../lib/invites.ts'
import { isoFromUnix, mapSubscriptionStatus } from '../lib/util.ts'

/**
 * Subscription checkouts (the agency paying for Foxy HUB) and the old checkout flow for
 * client invoices. Returns the sign-up invitations to send once billing is recorded.
 */
export async function handleCheckoutCompleted(
  event: Stripe.Event
): Promise<PendingInviteJob | null> {
  const session = event.data.object as Stripe.Checkout.Session
  console.log(`checkout.session.completed ${session.id} mode=${session.mode}`)

  // Captured now, redeemed after the billing writes (see index.ts).
  let pendingInviteJob: PendingInviteJob | null = null
  const orgIdFromMeta = session.metadata?.org_id || session.metadata?.orgId
  const userIdFromMeta = session.metadata?.user_id || session.metadata?.userId
  const rawPendingInvites = session.metadata?.pending_invitations

  if (orgIdFromMeta && rawPendingInvites) {
    pendingInviteJob = {
      orgId: orgIdFromMeta,
      userId: userIdFromMeta || '',
      raw: rawPendingInvites,
    }
  }

  if (session.mode === 'payment') {
    let hostedInvoiceUrl: string | null = null
    if (session.invoice) {
      const invoice = await stripe.invoices.retrieve(session.invoice as string)
      hostedInvoiceUrl = invoice.hosted_invoice_url ?? null
    }

    const invoiceId = session.metadata?.invoice_id

    if (invoiceId) {
      const { data: paidInvoice } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
          payment_intent: session.payment_intent as string,
          paid_at: new Date().toISOString(),
          invoice_url: hostedInvoiceUrl,
        })
        .eq('id', invoiceId)
        .select('org_id, project_id, invoice_number, amount, currency')
        .maybeSingle()

      console.log(`Invoice ${invoiceId} marked as paid.`)

      if (paidInvoice?.org_id) {
        const amount = Number(paidInvoice.amount)
        const money = Number.isFinite(amount)
          ? new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: (paidInvoice.currency as string) || 'USD',
              // Plain "$", never "US$", whatever the locale above becomes.
              currencyDisplay: 'narrowSymbol',
              maximumFractionDigits: 0,
            }).format(amount)
          : null

        const { error: feedError } = await supabase
          .from('activity_events')
          .insert({
            org_id: paidInvoice.org_id,
            actor_id: null,
            actor_kind: 'system',
            type: 'invoice_paid',
            summary: `Invoice ${paidInvoice.invoice_number} was paid${money ? ` — ${money}` : ''}`,
            project_id: paidInvoice.project_id,
            entity_type: 'invoice',
            entity_id: invoiceId,
            payload: {
              invoice_number: paidInvoice.invoice_number,
              amount: paidInvoice.amount,
            },
          })

        if (feedError) {
          console.error(
            'activity_events insert failed (invoice_paid):',
            feedError.message
          )
        }
      }
    }
    return pendingInviteJob
  }

  if (session.mode === 'subscription') {
    const subscriptionId = session.subscription

    if (!subscriptionId) {
      console.warn('No subscription found in checkout session')
      return pendingInviteJob
    }

    const subData = await stripe.subscriptions.retrieve(
      subscriptionId as string,
      {
        expand: ['latest_invoice.payment_intent'],
      }
    )
    // Optional chaining: `latest_invoice` is null on a subscription that has not
    // been billed yet (trials, $0 first period). Reading `.payment_intent` off it
    // threw a TypeError that took the whole update down with it — the card details
    // are worth skipping, the subscription row is not.
    const invoice = subData.latest_invoice as Stripe.Invoice | null
    const paymentIntent =
      (invoice?.payment_intent as Stripe.PaymentIntent | null) ?? null
    const stripePriceId = subData.items?.data?.[0]?.price?.id

    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id')
      .eq('price_id', stripePriceId)
      .maybeSingle()

    if (planError || !plan) {
      console.error(
        `Invalid Plan: Could not find internal plan for Price ID: ${stripePriceId}`
      )
      return pendingInviteJob
    }

    let paymentMethodType: string | null = null
    let paymentMethodDetails = {}
    let paymentIntentId: string | null = null

    if (paymentIntent) {
      paymentIntentId = paymentIntent.id

      const pi = await stripe.paymentIntents.retrieve(paymentIntent.id, {
        expand: ['latest_charge'],
      })

      const charge = pi.latest_charge as Stripe.Charge
      paymentMethodType = charge.payment_method_details?.type ?? null

      switch (paymentMethodType) {
        case 'card':
          paymentMethodDetails = charge.payment_method_details?.card ?? {}
          break
        case 'us_bank_account':
          paymentMethodDetails =
            charge.payment_method_details?.us_bank_account ?? {}
          break
        case 'klarna':
          paymentMethodDetails = charge.payment_method_details?.klarna ?? {}
          break
        case 'affirm':
          paymentMethodDetails = charge.payment_method_details?.affirm ?? {}
          break
        default:
          paymentMethodDetails = charge.payment_method_details ?? {}
      }
    }

    const orgId = session.metadata?.orgId || session.metadata?.org_id

    if (!orgId) {
      throw new Error(`Missing metadata in checkout session (orgId: ${orgId})`)
    }

    // Matched by org_id rather than a subscription row id: create-checkout never
    // has one to send (the row is created once by handle_new_user_signup, on the
    // Free plan, and only ever updated afterwards — never re-inserted), and
    // subscriptions_org_id_active_key guarantees at most one active row per org.
    const { data: updatedSubs, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscriptionId as string,
        stripe_payment_intent: paymentIntentId,
        // A fresh subscription is not cancelling.
        cancel_at: null,
        payment_method_type: paymentMethodType,
        payment_method_details: paymentMethodDetails,
        ...(mapSubscriptionStatus(subData.status)
          ? { status: mapSubscriptionStatus(subData.status) as string }
          : {}),
        plan_id: plan.id,
        current_period_end: subData.current_period_end
          ? new Date(subData.current_period_end * 1000).toISOString()
          : null,
      })
      .eq('org_id', orgId)
      .select()

    if (updateError) {
      throw new Error(
        `Failed to update subscription for org ${orgId}: ${updateError.message}`
      )
    }

    if (!updatedSubs || updatedSubs.length === 0) {
      throw new Error(`Subscription row not found for org: ${orgId}`)
    }

    console.log('Subscription updated successfully:', updatedSubs[0])

    // The first payment. Its `invoice.paid` usually arrives in the same second as
    // this event and can be handled BEFORE the customer id above is saved - finding
    // no workspace, it would be dropped. Recording it here makes that order not
    // matter; the upsert on stripe_invoice_id keeps the two from doubling up.
    if (invoice?.id && invoice.status === 'paid') {
      await recordSubscriptionInvoice(
        await stripe.invoices.retrieve(invoice.id),
        'paid',
        event,
        {
          paid_at: isoFromUnix(
            invoice.status_transitions?.paid_at ?? event.created
          ),
          next_attempt_at: null,
        }
      )
    }
  }
  return pendingInviteJob
}
