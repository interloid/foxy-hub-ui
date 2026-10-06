import Stripe from 'npm:stripe@14'

import { stripe, supabase } from '../lib/clients.ts'
import { syncPaymentMethod } from '../lib/payment-method.ts'
import { idOf } from '../lib/util.ts'

// The customer's default card changed (e.g. in the Stripe customer portal).
export async function handleCustomerUpdated(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer

  // The portal's "Use as default payment method" sets the CUSTOMER's default only.
  // Checkout already gave the subscription its own default (the card it was paid
  // with), and Stripe charges that one first - so without this, a new card changed
  // nothing: renewals still went to the old card. When the customer's default
  // changes, make it the subscription's default too.
  const previous = (event.data.previous_attributes ?? {}) as {
    invoice_settings?: { default_payment_method?: unknown }
  }
  const newDefault = idOf(
    customer.invoice_settings?.default_payment_method as
      string | Stripe.PaymentMethod | null
  )
  if (
    newDefault &&
    previous.invoice_settings &&
    'default_payment_method' in previous.invoice_settings
  ) {
    const { data: row } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('stripe_customer_id', customer.id)
      .maybeSingle()

    if (row?.stripe_subscription_id) {
      const live = await stripe.subscriptions.retrieve(
        row.stripe_subscription_id
      )
      if (
        live.status !== 'canceled' &&
        live.status !== 'incomplete_expired' &&
        idOf(live.default_payment_method) !== newDefault
      ) {
        await stripe.subscriptions.update(
          live.id,
          { default_payment_method: newDefault },
          // A retried event makes the same change; the key keeps it to one call.
          { idempotencyKey: `default-card:${event.id}` }
        )
      }
    }
  }

  await syncPaymentMethod(customer.id)
}
