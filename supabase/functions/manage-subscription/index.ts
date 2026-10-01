import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEMO_DISABLED, isDemoCaller } from '../_shared/demo.ts'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

/**
 * The agency's own subscription: change plan, cancel an upcoming change, list charges,
 * and open Stripe's hosted page to update the card.
 *
 * Plan-change rules - the same as `src/features/billing/lib/plan-change.ts`, restated here
 * because edge functions cannot import from `src/`:
 *
 *   - Higher tier, or the same tier monthly → yearly: switch NOW and restart the billing
 *     period today. Stripe charges the new plan's full price minus the unused part of the
 *     current one (`billing_cycle_anchor: 'now'` + `proration_behavior: 'always_invoice'`).
 *   - Lower tier from monthly to YEARLY: also NOW (the higher tier's features and seats
 *     go today). A year paid upfront should not wait up to a month for the current
 *     period to run out.
 *   - Any other lower tier, or the same tier yearly → monthly: book it for the END of the
 *     current period with a subscription schedule. Nothing is charged now.
 *   - Every downgrade must fit the team: more seats in use than the new plan has → 409.
 *
 * Duplicate protection, for the actions that change billing (`change`, `cancel_change`,
 * `resume`, `cancel`):
 *
 *   - Idempotency keys. The app sends a `requestId`, created once when the confirm step
 *     opens. Every Stripe write uses `<action>:<subscription row>:<requestId>:<step>` as
 *     its key, so a retried or double-submitted request gets Stripe's saved result back
 *     instead of a second proration invoice. Stripe keeps keys for 24 hours.
 *   - One change at a time. `plan_change_started_at` is claimed with a conditional update
 *     before any Stripe call and cleared when the request ends. A second request for the
 *     same workspace meanwhile gets 409. A claim older than LOCK_MS counts as abandoned
 *     (the function died mid-change), so a crash cannot block the workspace for good.
 *
 * Authorisation: the caller's own token reads their `subscriptions` row, and
 * `owners_admins_view_subscription` only returns it to a primary admin or admin (with
 * MFA satisfied). No row, no access. Writes then go through the service role.
 */

type Action =
  | 'change'
  | 'cancel_change'
  | 'resume'
  | 'cancel'
  | 'charges'
  | 'credit'
  | 'preview'
  | 'portal'
type Cycle = 'monthly' | 'yearly'

interface PlanRow {
  id: string
  name: string
  duration_months: number
  price_cents: number
  seats: number | null
  price_id: string | null
}

const TEAM_ROLES = ['primary_admin', 'admin', 'manager', 'contributor']

/** How long a plan-change claim is honoured before it counts as abandoned. */
const LOCK_MS = 60_000

/** A UUID from the app; anything else is refused rather than used as a Stripe key. */
const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allow =
    ALLOWED_ORIGINS.length === 0
      ? '*'
      : ALLOWED_ORIGINS.includes(origin)
        ? origin
        : ''
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
}

const cycleOf = (plan: PlanRow): Cycle =>
  plan.duration_months === 12 ? 'yearly' : 'monthly'

/** A tier's rank is its monthly price, so Free (0) < Starter < Studio < Agency. */
function rankOf(plans: PlanRow[], name: string): number {
  return (
    plans.find((p) => p.name === name && p.duration_months === 1)
      ?.price_cents ?? 0
  )
}

function timingOf(
  plans: PlanRow[],
  current: PlanRow,
  target: PlanRow
): 'none' | 'now' | 'period_end' {
  const from = rankOf(plans, current.name)
  const to = rankOf(plans, target.name)
  if (to > from) return 'now'
  // Lower tier: monthly → yearly switches now (a year paid upfront should not wait for
  // the month to run out); anything else waits for the period end.
  if (to < from) {
    return cycleOf(current) === 'monthly' && cycleOf(target) === 'yearly'
      ? 'now'
      : 'period_end'
  }
  if (cycleOf(target) === cycleOf(current)) return 'none'
  return cycleOf(target) === 'yearly' ? 'now' : 'period_end'
}

const iso = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  let action: Action
  let orgId: string
  let planName: string | undefined
  let cycle: Cycle | undefined
  let returnUrl: string | undefined
  let requestId: string | undefined
  let prorationDate: number | undefined
  try {
    const body = await req.json()
    action = body.action
    orgId = body.orgId
    planName = body.planName
    cycle = body.cycle
    returnUrl = body.returnUrl
    requestId = body.requestId
    prorationDate = body.prorationDate
  } catch {
    return json({ error: 'Malformed JSON body' }, 400)
  }
  if (
    ![
      'change',
      'cancel_change',
      'resume',
      'cancel',
      'charges',
      'credit',
      'preview',
      'portal',
    ].includes(action) ||
    !orgId
  ) {
    return json({ error: 'action and orgId are required' }, 400)
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Invalid token' }, 401)

  // Stripe and email are off for the shared demo workspace (see _shared/demo.ts).
  if (await isDemoCaller(userClient, user.id)) {
    return json({ error: DEMO_DISABLED }, 403)
  }

  // Doubles as the permission check - see the header comment.
  const { data: sub } = await userClient
    .from('subscriptions')
    .select(
      'id, plan_id, stripe_customer_id, stripe_subscription_id, pending_plan_id'
    )
    .eq('org_id', orgId)
    .maybeSingle()

  if (!sub) {
    return json({ error: 'Only an admin can manage the subscription.' }, 403)
  }

  // Set once this request holds the plan-change claim, so `finally` releases only its own.
  let claimed = false

  try {
    // ── Update the card on Stripe's hosted page ───────────────────────────────────────
    if (action === 'portal') {
      if (!sub.stripe_customer_id) {
        return json({ error: 'There is no card on file yet.' }, 409)
      }

      // Same rule as create-checkout: send people back only to an origin we trust.
      let back: URL
      try {
        back = new URL(returnUrl ?? '')
      } catch {
        return json({ error: 'Invalid return URL' }, 400)
      }
      if (
        (back.protocol !== 'https:' && back.protocol !== 'http:') ||
        (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(back.origin))
      ) {
        return json({ error: 'Invalid return URL' }, 400)
      }

      // Opens straight on "update payment method" rather than the portal's home page.
      // Needs the customer portal switched on in Stripe (Settings → Billing → Customer
      // portal); the new card reaches the database through stripe-webhook.
      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: back.toString(),
        flow_data: {
          type: 'payment_method_update',
          after_completion: {
            type: 'redirect',
            redirect: { return_url: back.toString() },
          },
        },
      })
      return json({ url: session.url })
    }

    // ── Exact amount of an immediate change, from Stripe ──────────────────────────────
    // Stripe's own preview of the invoice the change would create, so the confirm step
    // shows the real charge rather than the app's day-count estimate (Stripe prorates by
    // the second). The `prorationDate` it was priced at is returned, and `change` sends
    // it back, so the charge matches the preview to the cent. Read-only: no claim, no key.
    if (action === 'preview') {
      if (!planName || (cycle !== 'monthly' && cycle !== 'yearly')) {
        return json({ error: 'planName and cycle are required' }, 400)
      }
      if (!sub.stripe_subscription_id || !sub.stripe_customer_id) {
        return json({ preview: null }) // Free: paid on Checkout, nothing to prorate
      }

      const { data: previewPlans } = await admin
        .from('plans')
        .select('id, name, duration_months, price_cents, seats, price_id')
        .eq('is_active', true)
      const target = ((previewPlans ?? []) as PlanRow[]).find(
        (p) =>
          p.name === planName &&
          p.duration_months === (cycle === 'yearly' ? 12 : 1)
      )
      if (!target?.price_id) {
        return json({ error: 'That plan is not available.' }, 400)
      }

      const live = await stripe.subscriptions.retrieve(
        sub.stripe_subscription_id
      )
      const item = live.items.data[0]
      if (
        live.status === 'canceled' ||
        live.status === 'incomplete_expired' ||
        !item
      ) {
        return json({ preview: null })
      }

      const pricedAt = Math.floor(Date.now() / 1000)
      const upcoming = await stripe.invoices.retrieveUpcoming({
        customer: sub.stripe_customer_id,
        subscription: live.id,
        subscription_items: [{ id: item.id, price: target.price_id }],
        subscription_proration_behavior: 'always_invoice',
        subscription_billing_cycle_anchor: 'now',
        subscription_proration_date: pricedAt,
      })

      const lines = upcoming.lines.data
      const credit = -lines
        .filter((l) => l.amount < 0)
        .reduce((sum, l) => sum + l.amount, 0)
      const charge = lines
        .filter((l) => l.amount > 0)
        .reduce((sum, l) => sum + l.amount, 0)

      return json({
        preview: {
          newPrice: charge / 100,
          credit: credit / 100,
          // Credit already on the account (e.g. left over from a yearly plan) that Stripe
          // takes off this invoice: the difference between its total and what is due.
          accountCredit:
            Math.max(upcoming.total - upcoming.amount_due, 0) / 100,
          // After any credit already on the account.
          dueNow: upcoming.amount_due / 100,
          leftoverCredit: Math.max(-upcoming.total, 0) / 100,
          currency: upcoming.currency.toUpperCase(),
          prorationDate: pricedAt,
        },
      })
    }

    // ── Account credit ────────────────────────────────────────────────────────────────
    // Stripe's customer balance: negative is credit the customer holds (e.g. the unused
    // part of a yearly plan after moving to a monthly one), taken off the next invoices.
    if (action === 'credit') {
      if (!sub.stripe_customer_id) return json({ credit: 0, currency: null })
      const customer = await stripe.customers.retrieve(sub.stripe_customer_id)
      if (customer.deleted) return json({ credit: 0, currency: null })
      return json({
        credit: Math.max(-(customer.balance ?? 0), 0) / 100,
        currency: customer.currency?.toUpperCase() ?? null,
      })
    }

    // ── Recent charges ────────────────────────────────────────────────────────────────
    if (action === 'charges') {
      if (!sub.stripe_customer_id) return json({ charges: [] })

      const invoices = await stripe.invoices.list({
        customer: sub.stripe_customer_id,
        status: 'paid',
        limit: 6,
      })

      return json({
        charges: invoices.data
          // By the invoice's price, not what the card paid: a switch paid entirely from
          // account credit has amount_paid 0 and used to vanish from the list.
          .filter((inv) => inv.subscription && inv.total > 0)
          .map((inv) => ({
            id: inv.id,
            date: iso(inv.status_transitions?.paid_at ?? inv.created),
            // The largest positive line - on an upgrade the first one is the credit
            // for the plan being left.
            description: (() => {
              const main = inv.lines.data.reduce<
                (typeof inv.lines.data)[number] | undefined
              >(
                (best, l) => (!best || l.amount > best.amount ? l : best),
                undefined
              )
              return (
                main?.price?.nickname ?? main?.description ?? 'Subscription'
              )
            })(),
            amount: inv.total / 100,
            creditApplied: Math.max(inv.total - inv.amount_due, 0) / 100,
            currency: inv.currency.toUpperCase(),
            invoiceUrl: inv.hosted_invoice_url ?? null,
            invoiceNumber: inv.number ?? null,
          })),
      })
    }

    // ── From here on: `change` and `cancel_change`, which move money or bookings ──────
    if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) {
      return json({ error: 'requestId is required' }, 400)
    }
    const once = (step: string) => ({
      idempotencyKey: `${action}:${sub.id}:${requestId}:${step}`,
    })

    const now = new Date()
    const { data: claim, error: claimError } = await admin
      .from('subscriptions')
      .update({ plan_change_started_at: now.toISOString() })
      .eq('id', sub.id)
      .or(
        `plan_change_started_at.is.null,plan_change_started_at.lt.${new Date(
          now.getTime() - LOCK_MS
        ).toISOString()}`
      )
      .select('id')
    if (claimError)
      throw new Error(`Could not claim the plan change: ${claimError.message}`)
    if (!claim || claim.length === 0) {
      return json(
        {
          error:
            'Another plan change is already in progress. Wait a moment and try again.',
        },
        409
      )
    }
    claimed = true

    const retrieved = sub.stripe_subscription_id
      ? await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      : null
    // An ended subscription cannot be changed or resumed - only replaced through Checkout.
    // The webhook moves the row to Free when it ends; this covers the gap before it runs.
    const stripeSub =
      retrieved &&
      retrieved.status !== 'canceled' &&
      retrieved.status !== 'incomplete_expired'
        ? retrieved
        : null
    const scheduleId =
      typeof stripeSub?.schedule === 'string'
        ? stripeSub.schedule
        : (stripeSub?.schedule?.id ?? null)

    /**
     * Undoes a cancel-at-period-end, so the plan renews again. Also run before any plan
     * change: choosing a plan means keeping one, and a subscription schedule cannot be
     * built on a subscription that is set to cancel.
     */
    const resumeIfCancelling = async () => {
      if (!stripeSub?.cancel_at_period_end) return
      await stripe.subscriptions.update(
        stripeSub.id,
        { cancel_at_period_end: false },
        once('resume')
      )
      await admin
        .from('subscriptions')
        .update({ cancel_at: null })
        .eq('id', sub.id)
    }

    // ── Cancel the subscription ───────────────────────────────────────────────────────
    // At the END of the period: the plan works in full until then and nothing is
    // refunded; stripe-webhook moves the workspace to Free when it ends, and "Keep my
    // plan" (`resume`) undoes it before then.
    if (action === 'cancel') {
      if (!stripeSub) {
        return json(
          { error: 'There is no active subscription to cancel.' },
          409
        )
      }
      if (stripeSub.cancel_at_period_end) {
        return json({
          status: 'cancelling',
          cancelAt: iso(stripeSub.current_period_end),
        })
      }

      // Stripe will not set cancel_at_period_end on a subscription a schedule manages,
      // so a booked downgrade is dropped first - there is nothing left to downgrade.
      if (scheduleId) {
        await stripe.subscriptionSchedules.release(
          scheduleId,
          {},
          once('release')
        )
      }

      const cancelled = await stripe.subscriptions.update(
        stripeSub.id,
        { cancel_at_period_end: true },
        once('cancel')
      )

      const cancelAt = iso(cancelled.current_period_end)
      await admin
        .from('subscriptions')
        .update({
          cancel_at: cancelAt,
          pending_plan_id: null,
          pending_change_at: null,
        })
        .eq('id', sub.id)

      return json({ status: 'cancelling', cancelAt })
    }

    // ── Keep my plan ──────────────────────────────────────────────────────────────────
    if (action === 'resume') {
      if (!stripeSub) {
        return json(
          {
            error:
              'This subscription has already ended. Choose a plan to start again.',
          },
          409
        )
      }
      await resumeIfCancelling()
      return json({ status: 'resumed' })
    }

    // ── Cancel an upcoming change ─────────────────────────────────────────────────────
    if (action === 'cancel_change') {
      // Releasing keeps the subscription exactly as it is today and drops the next phase.
      if (scheduleId) {
        await stripe.subscriptionSchedules.release(
          scheduleId,
          {},
          once('release')
        )
      }
      await admin
        .from('subscriptions')
        .update({ pending_plan_id: null, pending_change_at: null })
        .eq('id', sub.id)
      return json({ status: 'cancelled' })
    }

    // ── Change plan ───────────────────────────────────────────────────────────────────
    if (!planName || (cycle !== 'monthly' && cycle !== 'yearly')) {
      return json({ error: 'planName and cycle are required' }, 400)
    }

    const { data: plans } = await admin
      .from('plans')
      .select('id, name, duration_months, price_cents, seats, price_id')
      .eq('is_active', true)
    const planRows = (plans ?? []) as PlanRow[]

    const target = planRows.find(
      (p) =>
        p.name === planName &&
        p.duration_months === (cycle === 'yearly' ? 12 : 1)
    )
    if (!target?.price_id)
      return json({ error: 'That plan is not available.' }, 400)

    // On Free, or the subscription has ended: nothing to change - the app sends them
    // through Checkout instead (reusing the Stripe customer).
    if (!stripeSub) return json({ status: 'checkout_required' })

    const current = planRows.find((p) => p.id === sub.plan_id)
    if (!current)
      return json({ error: 'Your current plan was not found.' }, 409)

    const timing = timingOf(planRows, current, target)
    if (timing === 'none') return json({ status: 'unchanged' })

    const item = stripeSub.items.data[0]
    if (!item) return json({ error: 'The subscription has no plan item.' }, 409)

    // Any downgrade - now or at period end - must fit everyone still active. Checked
    // before anything changes in Stripe (including undoing a cancellation).
    const isDowngrade =
      rankOf(planRows, target.name) < rankOf(planRows, current.name)
    if (isDowngrade) {
      const [{ count: members }, { count: invites }] = await Promise.all([
        admin
          .from('memberships')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .in('role', TEAM_ROLES)
          .eq('status', true),
        admin
          .from('invitations')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .in('role', TEAM_ROLES)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString()),
      ])
      const used = (members ?? 0) + (invites ?? 0)
      if (target.seats !== null && used > target.seats) {
        return json(
          {
            error: `${target.name} has ${target.seats} seats and ${used} are in use. Deactivate someone in People first.`,
          },
          409
        )
      }
    }

    await resumeIfCancelling()

    if (timing === 'now') {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const prorationAt =
        Number.isInteger(prorationDate) &&
        prorationDate! <= nowSeconds &&
        nowSeconds - prorationDate! <= 15 * 60
          ? prorationDate
          : undefined

      // Replaces any booked downgrade.
      if (scheduleId) {
        await stripe.subscriptionSchedules.release(
          scheduleId,
          {},
          once('release')
        )
      }

      const updated = await stripe.subscriptions.update(
        stripeSub.id,
        {
          items: [{ id: item.id, price: target.price_id }],
          proration_behavior: 'always_invoice',
          billing_cycle_anchor: 'now',
          // The moment the confirm step's preview was priced at, so the charge matches it
          // exactly. Only a recent one is trusted; otherwise Stripe prices it as of now.
          ...(prorationAt ? { proration_date: prorationAt } : {}),
          // The plan only changes once the difference is paid; a declined card leaves the
          // subscription as it was, with the update pending.
          payment_behavior: 'pending_if_incomplete',
          expand: ['latest_invoice'],
        },
        once('update')
      )

      if (updated.pending_update) {
        const invoice = updated.latest_invoice as Stripe.Invoice | null
        return json({
          status: 'payment_failed',
          invoiceUrl: invoice?.hosted_invoice_url ?? null,
        })
      }

      // The webhook writes the same values; writing them here too means the page is right
      // the moment the call returns.
      await admin
        .from('subscriptions')
        .update({
          plan_id: target.id,
          current_period_end: iso(updated.current_period_end),
          pending_plan_id: null,
          pending_change_at: null,
        })
        .eq('id', sub.id)

      return json({
        status: 'switched',
        renewsAt: iso(updated.current_period_end),
      })
    }

    // timing === 'period_end' - booked with a subscription schedule.
    const schedule = scheduleId
      ? await stripe.subscriptionSchedules.retrieve(scheduleId)
      : await stripe.subscriptionSchedules.create(
          { from_subscription: stripeSub.id },
          once('schedule-create')
        )

    const phaseStart =
      schedule.current_phase?.start_date ?? stripeSub.current_period_start
    const phaseEnd =
      schedule.current_phase?.end_date ?? stripeSub.current_period_end

    await stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: 'release',
        phases: [
          {
            items: [{ price: item.price.id, quantity: 1 }],
            start_date: phaseStart,
            end_date: phaseEnd,
            proration_behavior: 'none',
          },
          {
            items: [{ price: target.price_id, quantity: 1 }],
            iterations: 1,
            proration_behavior: 'none',
          },
        ],
      },
      once('schedule-update')
    )

    await admin
      .from('subscriptions')
      .update({
        pending_plan_id: target.id,
        pending_change_at: iso(phaseEnd),
      })
      .eq('id', sub.id)

    return json({ status: 'scheduled', effectiveAt: iso(phaseEnd) })
  } catch (err) {
    console.error('manage-subscription failed:', (err as Error).message)
    // The saved customer / subscription id is not in this Stripe account - seed data, or
    // ids from the other mode (test vs live). Retrying will not help, so say so.
    if ((err as { code?: string }).code === 'resource_missing') {
      return json(
        {
          error:
            'This workspace’s subscription was not found in Stripe. Contact support to reconnect billing.',
        },
        409
      )
    }
    // The same requestId was already used with different parameters - a reused confirm
    // step. Stripe refuses rather than guessing; the app should start a fresh request.
    if ((err as { type?: string }).type === 'StripeIdempotencyError') {
      return json(
        {
          error:
            'This change was already submitted. Reopen Change plan and try again.',
        },
        409
      )
    }
    return json({ error: 'Stripe could not update the subscription.' }, 502)
  } finally {
    if (claimed) {
      const { error: releaseError } = await admin
        .from('subscriptions')
        .update({ plan_change_started_at: null })
        .eq('id', sub.id)
      if (releaseError) {
        // Not fatal: the claim lapses on its own after LOCK_MS.
        console.error(
          'Could not release the plan-change claim:',
          releaseError.message
        )
      }
    }
  }
})
