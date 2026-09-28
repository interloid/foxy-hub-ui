import Stripe from 'npm:stripe@14'

import { stripe, supabase } from '../lib/clients.ts'
import { syncPaymentMethod } from '../lib/payment-method.ts'
import { isoFromUnix, mapSubscriptionStatus } from '../lib/util.ts'

/** `customer.subscription.updated` / `.deleted` - plan, status, period, cancellation. */
export async function handleSubscriptionChange(event: Stripe.Event) {
  let sub = event.data.object as Stripe.Subscription

  if (!sub.current_period_end || !sub.items) {
    sub = await stripe.subscriptions.retrieve(sub.id)
  }

  // Matched on the SUBSCRIPTION, not the customer. Once a subscription ends the row
  // goes back to Free with no stripe_subscription_id, so a late event for it - or
  // for an older subscription on the same customer - finds nothing instead of
  // putting the paid plan back.
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, pending_plan_id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()

  if (!existing) {
    console.warn(
      `${event.type}: no workspace is on subscription ${sub.id}; nothing updated`
    )
    return
  }

  // Ended - cancelled immediately, or at the end of its period. Back to exactly
  // what sign-up creates: Free, active, no Stripe subscription. The customer id is
  // kept, so a later checkout reuses it, and Free's seat and client limits apply
  // again (an ended subscription used to leave them unlimited).
  if (event.type === 'customer.subscription.deleted') {
    const { data: free } = await supabase
      .from('plans')
      .select('id')
      .eq('name', 'Free')
      .limit(1)
      .maybeSingle()

    const { error: endError } = await supabase
      .from('subscriptions')
      .update(
        free
          ? {
              plan_id: free.id,
              status: 'active',
              stripe_subscription_id: null,
              stripe_payment_intent: null,
              current_period_end: null,
              pending_plan_id: null,
              pending_change_at: null,
              cancel_at: null,
            }
          : // No Free plan to fall back to: at least record that it ended.
            {
              status: 'cancelled',
              pending_plan_id: null,
              pending_change_at: null,
              cancel_at: null,
            }
      )
      .eq('id', existing.id)

    if (endError) {
      throw new Error(
        `Could not end subscription ${sub.id}: ${endError.message}`
      )
    }
    if (!free) console.error('No Free plan found; the row is marked cancelled')
    console.log(`Subscription ${sub.id} ended; workspace moved to Free`)
    return
  }

  const stripePriceId = sub.items?.data?.[0]?.price?.id

  const { data: planExists } = await supabase
    .from('plans')
    .select('id')
    .eq('price_id', stripePriceId)
    .maybeSingle()

  if (!planExists) {
    console.warn(`Plan not found in database for Price ID: ${stripePriceId}`)
  }

  // A booked change (manage-subscription's schedule) is done once its plan is the
  // one the subscription is on.
  const clearPending = planExists && existing.pending_plan_id === planExists.id

  // Cancelled but still running until the period ends ("Ends on …"). Cleared again
  // when the cancellation is undone ("Keep my plan").
  const cancelAt = sub.cancel_at_period_end
    ? isoFromUnix(sub.current_period_end)
    : isoFromUnix(sub.cancel_at)

  const mappedStatus = mapSubscriptionStatus(sub.status)
  const { error: subUpdateError } = await supabase
    .from('subscriptions')
    .update({
      ...(mappedStatus ? { status: mappedStatus } : {}),
      ...(planExists ? { plan_id: planExists.id } : {}),
      ...(clearPending
        ? { pending_plan_id: null, pending_change_at: null }
        : {}),
      cancel_at: cancelAt,
      current_period_end: isoFromUnix(sub.current_period_end),
    })
    .eq('id', existing.id)

  if (subUpdateError) {
    console.error('Subscription update failed:', subUpdateError.message)
  }

  await syncPaymentMethod(sub.customer as string)
}

// A booked change was dropped outside the app (released or cancelled in the Stripe
// dashboard). Released at its natural end, the pending fields are already clear.
export async function handleScheduleEnded(event: Stripe.Event) {
  const schedule = event.data.object as Stripe.SubscriptionSchedule
  const subscriptionId =
    typeof schedule.released_subscription === 'string'
      ? schedule.released_subscription
      : typeof schedule.subscription === 'string'
        ? schedule.subscription
        : (schedule.subscription?.id ?? null)
  if (!subscriptionId) return

  // A late event for an OLD schedule must not wipe a change booked since.
  const live = await stripe.subscriptions.retrieve(subscriptionId)
  const liveScheduleId =
    typeof live.schedule === 'string'
      ? live.schedule
      : (live.schedule?.id ?? null)
  if (liveScheduleId && liveScheduleId !== schedule.id) return

  const { error: pendingError } = await supabase
    .from('subscriptions')
    .update({ pending_plan_id: null, pending_change_at: null })
    .eq('stripe_subscription_id', subscriptionId)
  if (pendingError) {
    console.error('Clearing the upcoming change failed:', pendingError.message)
  }
}
