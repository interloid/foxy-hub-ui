import { stripe, supabase } from './clients.ts'

/**
 * Keeps `payment_method_type` / `payment_method_details` on the card the NEXT renewal is
 * charged to. Checkout records the card it was paid with, once; without this, a card
 * changed later in Stripe would never reach the billing page.
 *
 * The subscription's own default wins (Checkout sets it); otherwise the customer's
 * `invoice_settings.default_payment_method`. Never throws - a card that fails to sync is
 * not worth failing the event, and retrying it would re-apply the billing writes.
 */
export async function syncPaymentMethod(customerId: string) {
  try {
    const { data: row } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (!row) return

    const sub = row.stripe_subscription_id
      ? await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      : null
    let pm = sub?.default_payment_method ?? null
    if (!pm) {
      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) return
      pm = customer.invoice_settings?.default_payment_method ?? null
    }
    if (!pm) return

    const method =
      typeof pm === 'string' ? await stripe.paymentMethods.retrieve(pm) : pm
    const details = (method as unknown as Record<string, unknown>)[method.type]

    const { error } = await supabase
      .from('subscriptions')
      .update({
        payment_method_type: method.type,
        payment_method_details: details ?? {},
      })
      .eq('id', row.id)
    if (error) console.error('Payment method sync failed:', error.message)
  } catch (err) {
    console.error(
      'Payment method sync failed:',
      err instanceof Error ? err.message : String(err)
    )
  }
}
