import 'server-only'

import { describeFunctionError } from '@/features/onboarding/services/billing'
import { getSeatUsage } from '@/features/people/queries'
import { getWorkspace } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'

import type {
  BillingCharge,
  BillingPaymentIssue,
  BillingCycle,
  BillingOverview,
  BillingPlan,
  PlanOption,
  SubscriptionStatus,
} from './types'

/** Plans are priced in USD in Stripe; `plans` has no currency column. */
const PLAN_CURRENCY = 'USD'

/** Marketing lines for the Change plan cards - not stored with the plan. */
const PLAN_DESCRIPTIONS: Record<string, string> = {
  Starter: 'One person, unlimited clients',
  Studio: 'Small team, AI updates, Stripe payments',
  Agency: 'Bigger team, reports and audit history',
}

const UNLOCKS = [
  'Unlimited projects & clients',
  'AI weekly updates',
  'Client invoice payments',
]

type PlanRow = {
  id: string
  name: string
  duration_months: number
  price_cents: number
  seats: number | null
}

const cycleOf = (plan: PlanRow): BillingCycle =>
  plan.duration_months === 12 ? 'yearly' : 'monthly'

/** `PlanOption.id` - one id per tier, covering its monthly and yearly rows. */
const tierId = (name: string) => name.toLowerCase()

/** The app's shorter status list; the database enum has more states than the page shows. */
function toStatus(status: string): SubscriptionStatus {
  if (status === 'active' || status === 'trialing') return status
  if (status === 'cancelled' || status === 'expired') return 'canceled'
  return 'past_due'
}

function periodStartOf(renewsAt: string | null, plan: PlanRow): string | null {
  if (!renewsAt || plan.duration_months <= 0) return null
  const date = new Date(renewsAt)
  date.setUTCMonth(date.getUTCMonth() - plan.duration_months)
  return date.toISOString().slice(0, 10)
}

function toPlanOptions(rows: PlanRow[]): PlanOption[] {
  const tiers = new Map<string, PlanOption>()
  for (const row of rows) {
    if (row.duration_months <= 0) continue // Free is not something you switch to
    const option = tiers.get(row.name) ?? {
      id: tierId(row.name),
      rank: 0,
      name: row.name,
      description: PLAN_DESCRIPTIONS[row.name] ?? '',
      seats: row.seats ?? 0,
      monthlyPrice: 0,
      yearlyPrice: 0,
    }
    if (row.duration_months === 12) option.yearlyPrice = row.price_cents / 100
    else {
      option.monthlyPrice = row.price_cents / 100
      // Rank by monthly price, so Starter < Studio < Agency.
      option.rank = row.price_cents
    }
    tiers.set(row.name, option)
  }
  return [...tiers.values()].sort((a, b) => a.rank - b.rank)
}

function toPaymentMethod(
  type: string | null,
  details: unknown
): BillingPlan['paymentMethod'] {
  if (type !== 'card' || !details || typeof details !== 'object') return null
  const { brand, last4, exp_month, exp_year } = details as {
    brand?: string
    last4?: string
    exp_month?: number
    exp_year?: number
  }
  if (!brand || !last4) return null
  return {
    brand: brand.charAt(0).toUpperCase() + brand.slice(1),
    last4,
    expMonth: typeof exp_month === 'number' ? exp_month : null,
    expYear: typeof exp_year === 'number' ? exp_year : null,
  }
}

/**
 * Stripe's own list of paid subscription invoices, through `manage-subscription`. Only a
 * fallback now: payments are recorded in `billing_payments` by the webhook, but charges
 * from before that table existed are only in Stripe.
 */
/** The Stripe customer balance, when it is credit. Null on any failure - it is extra. */
async function getCredit(orgId: string): Promise<BillingOverview['credit']> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke(
    'manage-subscription',
    {
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
      body: { action: 'credit', orgId },
    }
  )
  if (error) {
    console.error('Could not load credit:', await describeFunctionError(error))
    return null
  }
  const amount = Number(data?.credit)
  return amount > 0
    ? { amount, currency: (data.currency as string | null) ?? PLAN_CURRENCY }
    : null
}

async function getStripeCharges(orgId: string): Promise<BillingCharge[]> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke(
    'manage-subscription',
    {
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
      body: { action: 'charges', orgId },
    }
  )

  // Charges are a nice-to-have on this page: Stripe being unreachable must not take the
  // plan card down with it.
  if (error || !Array.isArray(data?.charges)) {
    if (error) {
      console.error(
        'Could not load charges:',
        await describeFunctionError(error)
      )
    }
    return []
  }
  return (
    data.charges as (Omit<
      BillingCharge,
      'status' | 'refunded' | 'invoiceUrl' | 'invoiceNumber' | 'creditApplied'
    > & {
      invoiceUrl?: string | null
      invoiceNumber?: string | null
      creditApplied?: number
    })[]
  ).map((charge) => ({
    ...charge,
    creditApplied: Number(charge.creditApplied) || 0,
    date: charge.date.slice(0, 10),
    refunded: 0,
    status: 'paid' as const,
    invoiceUrl: charge.invoiceUrl ?? null,
    invoiceNumber: charge.invoiceNumber ?? null,
  }))
}

type PaymentRow = {
  id: string
  created_at: string
  paid_at: string | null
  description: string | null
  amount_due_cents: number
  amount_paid_cents: number
  amount_refunded_cents: number
  total_cents: number
  credit_applied_cents: number
  currency: string
  status: BillingCharge['status']
  failure_message: string | null
  next_attempt_at: string | null
  hosted_invoice_url: string | null
  invoice_number: string | null
  plan: { name: string } | { name: string }[] | null
}

/** Recent payments and, when the newest one went wrong, the issue to warn about. */
async function getPayments(
  orgId: string,
  { stripeFallback }: { stripeFallback: boolean }
): Promise<{
  charges: BillingCharge[]
  issue: BillingPaymentIssue | null
}> {
  const fallback = async () =>
    stripeFallback ? await getStripeCharges(orgId) : []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('billing_payments')
    .select(
      'id, created_at, paid_at, description, amount_due_cents, amount_paid_cents, amount_refunded_cents, total_cents, credit_applied_cents, currency, status, failure_message, next_attempt_at, hosted_invoice_url, invoice_number, plan:plans(name)'
    )
    .eq('org_id', orgId)
    // Any invoice with a price, including one paid entirely from account credit (nothing
    // due): those used to be hidden, so a plan switch paid from credit left no trace.
    // amount_due covers rows recorded before total_cents existed.
    .or('total_cents.gt.0,amount_due_cents.gt.0')
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(6)

  if (error) {
    console.error('Could not load payments:', error.message)
    return { charges: await fallback(), issue: null }
  }

  const rows = (data ?? []) as PaymentRow[]
  if (rows.length === 0) {
    return { charges: await fallback(), issue: null }
  }

  const charges = rows.map((row): BillingCharge => {
    const plan = Array.isArray(row.plan) ? row.plan[0] : row.plan
    const charged = row.amount_paid_cents || row.amount_due_cents
    // Older rows have no total: fall back to what was charged.
    const total = Math.max(row.total_cents, charged)
    return {
      id: row.id,
      date: (row.paid_at ?? row.created_at).slice(0, 10),
      description: plan
        ? `${plan.name} plan`
        : (row.description ?? 'Subscription'),
      amount: total / 100,
      creditApplied: row.credit_applied_cents / 100,
      refunded: row.amount_refunded_cents / 100,
      currency: row.currency.toUpperCase(),
      status: row.status,
      invoiceUrl: row.hosted_invoice_url,
      invoiceNumber: row.invoice_number,
    }
  })

  const latest = rows[0]!
  const issue: BillingPaymentIssue | null =
    latest.status === 'failed' || latest.status === 'requires_action'
      ? {
          status: latest.status,
          amount: latest.amount_due_cents / 100,
          currency: latest.currency.toUpperCase(),
          message: latest.failure_message,
          nextAttemptAt: latest.next_attempt_at,
          invoiceUrl: latest.hosted_invoice_url,
        }
      : null

  return { charges, issue }
}

export async function getBillingOverview(
  org: string
): Promise<BillingOverview | null> {
  const workspace = await getWorkspace(org)
  if (!workspace) return null

  const supabase = await createClient()
  const [subRes, plansRes, seats, payments, credit] = await Promise.all([
    supabase
      .from('subscriptions')
      .select(
        'plan_id, pending_plan_id, pending_change_at, cancel_at, status, current_period_end, payment_method_type, payment_method_details'
      )
      .eq('org_id', workspace.id)
      .maybeSingle(),
    supabase
      .from('plans')
      .select('id, name, duration_months, price_cents, seats')
      .eq('is_active', true),
    getSeatUsage(workspace.id),
    // The demo workspace's Stripe ids are made up, so it never asks Stripe.
    getPayments(workspace.id, { stripeFallback: !workspace.isDemo }),
    workspace.isDemo ? null : getCredit(workspace.id),
  ])

  if (subRes.error)
    throw new Error(`Could not load the subscription: ${subRes.error.message}`)
  if (plansRes.error)
    throw new Error(`Could not load plans: ${plansRes.error.message}`)

  const rows = (plansRes.data ?? []) as PlanRow[]
  const sub = subRes.data
  const currentRow = rows.find((p) => p.id === sub?.plan_id)
  const pendingRow = rows.find((p) => p.id === sub?.pending_plan_id)

  const renewsAt = sub?.current_period_end?.slice(0, 10) ?? null
  const isPaid = Boolean(currentRow && currentRow.duration_months > 0)

  const plan: BillingPlan = {
    planId: currentRow ? tierId(currentRow.name) : 'free',
    name: currentRow?.name ?? 'Free',
    status: toStatus(sub?.status ?? 'active'),
    cycle: currentRow ? cycleOf(currentRow) : 'monthly',
    price: (currentRow?.price_cents ?? 0) / 100,
    currency: PLAN_CURRENCY,
    usedSeats: seats.used,
    totalSeats: currentRow?.seats ?? seats.maxMembers ?? seats.used,
    periodStart:
      isPaid && currentRow ? periodStartOf(renewsAt, currentRow) : null,
    renewsAt: isPaid ? renewsAt : null,
    paymentMethod: toPaymentMethod(
      sub?.payment_method_type ?? null,
      sub?.payment_method_details
    ),
    upcoming:
      pendingRow && sub?.pending_change_at
        ? {
            planId: tierId(pendingRow.name),
            planName: pendingRow.name,
            cycle: cycleOf(pendingRow),
            effectiveAt: sub.pending_change_at.slice(0, 10),
          }
        : null,
    cancelsAt: isPaid ? (sub?.cancel_at?.slice(0, 10) ?? null) : null,
  }

  return {
    plan,
    plans: toPlanOptions(rows),
    unlocks: UNLOCKS,
    charges: payments.charges,
    paymentIssue: payments.issue,
    credit,
  }
}
