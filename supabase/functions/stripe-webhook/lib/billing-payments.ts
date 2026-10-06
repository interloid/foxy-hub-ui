// ── Agency subscription payments (`billing_payments`) ──────────────────────────────────

import Stripe from 'npm:stripe@14'

import { stripe, supabase } from './clients.ts'
import { idOf, isoFromUnix } from './util.ts'

export type BillingPaymentStatus =
  | 'pending'
  | 'requires_action'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'dispute_lost'
  | 'void'

/**
 * Stripe does not promise delivery order. An event older than the newest one already
 * applied to a row is skipped, so a late "payment_failed" cannot undo a "paid".
 */
export function isStale(
  lastEventAt: string | null | undefined,
  event: Stripe.Event
) {
  return Boolean(lastEventAt) && Date.parse(lastEventAt!) > event.created * 1000
}

/** Refund and dispute states come from charge events; an invoice event never undoes them. */
export const CHARGE_STATUSES: BillingPaymentStatus[] = [
  'refunded',
  'partially_refunded',
  'disputed',
  'dispute_lost',
]

/**
 * The invoice's main line: the largest positive one. On an upgrade's proration invoice the
 * FIRST line is the credit for the old plan ("Unused time on Starter", negative) - reading
 * it named the payment after the plan being left.
 */
export function mainLine(invoice: Stripe.Invoice) {
  const lines = invoice.lines?.data ?? []
  return (
    lines.reduce<(typeof lines)[number] | undefined>(
      (best, line) => (!best || line.amount > best.amount ? line : best),
      undefined
    ) ?? lines[0]
  )
}

/**
 * Creates or updates the row for one subscription invoice. Throws on a write failure so
 * the event claim is released and Stripe retries; the upsert makes a retry harmless.
 *
 * The status comes from the INVOICE (re-read from Stripe), not from which event this is:
 * `invoice.finalized`, `.paid` and `.payment_succeeded` often arrive in the same second,
 * and a "finalized → pending" handled last used to overwrite "paid". `eventStatus` is
 * only used while the invoice is still open (pending / failed / requires_action).
 */
export async function recordSubscriptionInvoice(
  invoice: Stripe.Invoice,
  eventStatus: BillingPaymentStatus,
  event: Stripe.Event,
  extra: Record<string, unknown> = {}
) {
  const customerId = idOf(invoice.customer)
  if (!customerId) return

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, org_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (!sub) {
    console.warn(
      `No subscription row for Stripe customer ${customerId}; payment ${invoice.id} not recorded`
    )
    return
  }

  const { data: existing } = await supabase
    .from('billing_payments')
    .select('last_event_at, status')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle()
  if (isStale(existing?.last_event_at, event)) {
    console.log(
      `Skipping ${event.type} for ${invoice.id}: a newer event was applied`
    )
    return
  }

  const truth: BillingPaymentStatus =
    invoice.status === 'paid'
      ? 'paid'
      : invoice.status === 'void' || invoice.status === 'uncollectible'
        ? 'void'
        : eventStatus
  // A refunded or disputed payment stays that way when a late invoice event says "paid".
  const keepStatus =
    truth === 'paid' &&
    CHARGE_STATUSES.includes(existing?.status as BillingPaymentStatus)
  // The event's extras (failed_at, the decline reason…) only apply when the invoice is
  // actually in the state that event describes.
  const applyExtra = truth === eventStatus

  const line = mainLine(invoice)
  const priceId = line?.price?.id
  const { data: plan } = priceId
    ? await supabase
        .from('plans')
        .select('id, name')
        .eq('price_id', priceId)
        .maybeSingle()
    : { data: null }

  const { error } = await supabase.from('billing_payments').upsert(
    {
      org_id: sub.org_id,
      subscription_id: sub.id,
      plan_id: plan?.id ?? null,
      stripe_invoice_id: invoice.id,
      invoice_number: invoice.number ?? null,
      stripe_payment_intent_id: idOf(invoice.payment_intent),
      stripe_charge_id: idOf(invoice.charge),
      billing_reason: invoice.billing_reason ?? null,
      description: line?.description ?? null,
      amount_due_cents: invoice.amount_due,
      amount_paid_cents: invoice.amount_paid,
      // What account credit paid (the customer balance applied to this invoice).
      total_cents: invoice.total,
      credit_applied_cents: Math.max(invoice.total - invoice.amount_due, 0),
      currency: invoice.currency,
      ...(keepStatus ? {} : { status: truth }),
      ...(truth === 'paid'
        ? {
            paid_at: isoFromUnix(
              invoice.status_transitions?.paid_at ?? event.created
            ),
          }
        : {}),
      attempt_count: invoice.attempt_count ?? 0,
      next_attempt_at: isoFromUnix(invoice.next_payment_attempt),
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      period_start: isoFromUnix(line?.period?.start),
      period_end: isoFromUnix(line?.period?.end),
      last_event_id: event.id,
      last_event_at: isoFromUnix(event.created),
      updated_at: new Date().toISOString(),
      ...(applyExtra ? extra : {}),
    },
    { onConflict: 'stripe_invoice_id' }
  )
  if (error) {
    throw new Error(`Could not record payment ${invoice.id}: ${error.message}`)
  }

  // The workspace Activity feed's Billing line - only when the payment actually changes to
  // paid or failed, so the paired events Stripe sends for one payment write one line.
  if (
    !keepStatus &&
    (truth === 'paid' || truth === 'failed') &&
    existing?.status !== truth
  ) {
    await logSubscriptionPayment(
      sub.org_id,
      invoice,
      truth,
      plan?.name ?? null,
      {
        ...(applyExtra ? extra : {}),
      }
    )
  }
}

async function logSubscriptionPayment(
  orgId: string,
  invoice: Stripe.Invoice,
  status: 'paid' | 'failed',
  planName: string | null,
  extra: Record<string, unknown>
) {
  const { data: payment } = await supabase
    .from('billing_payments')
    .select('id')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle()
  if (!payment) return

  const type =
    status === 'paid' ? 'billing_payment_succeeded' : 'billing_payment_failed'

  // Two webhook deliveries can both see the old status; the second finds this row.
  const { data: already } = await supabase
    .from('activity_events')
    .select('id')
    .eq('type', type)
    .eq('entity_id', payment.id)
    .limit(1)
  if (already && already.length > 0) return

  const cents = status === 'paid' ? invoice.amount_paid : invoice.amount_due
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (invoice.currency || 'usd').toUpperCase(),
    currencyDisplay: 'narrowSymbol',
  }).format(cents / 100)
  const what = planName ? `the ${planName} plan` : 'the subscription'
  const reason =
    typeof extra.failure_message === 'string' ? extra.failure_message : null

  const { error } = await supabase.from('activity_events').insert({
    org_id: orgId,
    actor_id: null,
    actor_kind: 'system',
    type,
    summary:
      status === 'paid'
        ? `Payment of ${money} for ${what} went through`
        : `Payment of ${money} for ${what} failed`,
    entity_type: 'billing_payment',
    entity_id: payment.id,
    payload: {
      amount_cents: cents,
      currency: invoice.currency,
      stripe_invoice_id: invoice.id,
      changes: [
        {
          label: 'Payment',
          from: null,
          to: status === 'paid' ? 'Paid' : 'Failed',
        },
      ],
      ...(status === 'failed'
        ? {
            note: [
              reason,
              invoice.next_payment_attempt
                ? 'Stripe will retry the card'
                : 'No more automatic retries - update the card on Billing',
            ]
              .filter(Boolean)
              .join(' - '),
          }
        : {}),
    },
  })
  if (error) {
    console.error(`activity_events insert failed (${type}):`, error.message)
  }
}

/** Why the last attempt was declined, from the invoice's payment intent. */
export async function declineReason(
  invoice: Stripe.Invoice
): Promise<{ failure_code: string | null; failure_message: string | null }> {
  const paymentIntentId = idOf(invoice.payment_intent)
  if (!paymentIntentId) return { failure_code: null, failure_message: null }
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    const lastError = pi.last_payment_error
    return {
      failure_code: lastError?.decline_code ?? lastError?.code ?? null,
      failure_message: lastError?.message ?? null,
    }
  } catch {
    return { failure_code: null, failure_message: null }
  }
}

/**
 * Applies a charge-level event (refund, dispute) to the payment it belongs to. A charge
 * that is not a subscription payment - a client paying an agency invoice - has no row
 * here and is left alone.
 */
export async function updatePaymentForCharge(
  match: { chargeId: string | null; paymentIntentId: string | null },
  event: Stripe.Event,
  patch: Record<string, unknown>
) {
  const value = match.chargeId ?? match.paymentIntentId
  if (!value) return

  // By charge first; a row recorded before its charge existed (a pending invoice) only
  // has the payment intent.
  let row: { id: string; last_event_at: string | null } | null = null
  for (const [column, id] of [
    ['stripe_charge_id', match.chargeId],
    ['stripe_payment_intent_id', match.paymentIntentId],
  ] as const) {
    if (!id || row) continue
    const { data } = await supabase
      .from('billing_payments')
      .select('id, last_event_at')
      .eq(column, id)
      .maybeSingle()
    row = data
  }

  if (!row) {
    console.log(
      `${event.type}: ${value} is not a subscription payment; nothing to update`
    )
    return
  }
  if (isStale(row.last_event_at, event)) {
    console.log(
      `Skipping ${event.type} for ${value}: a newer event was applied`
    )
    return
  }

  const { error } = await supabase
    .from('billing_payments')
    .update({
      ...patch,
      ...(match.chargeId ? { stripe_charge_id: match.chargeId } : {}),
      last_event_id: event.id,
      last_event_at: isoFromUnix(event.created),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) {
    throw new Error(`Could not update payment ${value}: ${error.message}`)
  }
}
