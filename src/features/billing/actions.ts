'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { siteConfig } from '@/config/site'
import {
  CheckoutServiceError,
  createCheckoutSession,
  describeFunctionError,
} from '@/features/onboarding/services/billing'
import type { ActionResult } from '@/features/onboarding/types'
import { getWorkspace } from '@/lib/dal'
import { isBillingRole } from '@/lib/role'
import { createClient } from '@/lib/supabase/server'

const TIER_NAMES = {
  starter: 'Starter',
  studio: 'Studio',
  agency: 'Agency',
} as const

const planChangeSchema = z.object({
  planId: z.enum(['starter', 'studio', 'agency']),
  cycle: z.enum(['monthly', 'yearly']),
  // One per confirm step - the Stripe idempotency key is built from it.
  requestId: z.uuid(),
  /** Unix seconds the confirm step's Stripe preview was priced at - see previewPlanChangeAction. */
  prorationDate: z.number().int().positive().optional(),
})

export type PlanChangeOutcome =
  | { status: 'switched'; renewsAt: string | null }
  | { status: 'scheduled'; effectiveAt: string | null }
  | { status: 'payment_failed'; invoiceUrl: string | null }
  | { status: 'checkout'; url: string }
  | { status: 'unchanged' }

const GENERIC_ERROR = 'Could not change the plan. Try again.'

async function requireBillingAdmin(orgSlug: string) {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace || !isBillingRole(workspace.role)) return null
  return workspace
}

async function invokeManageSubscription(body: Record<string, unknown>) {
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
      body,
    }
  )

  if (error) {
    // The function's own message ("Deactivate someone in People first") is the useful
    // part; the transport error around it is not.
    const context = (error as Error & { context?: unknown }).context
    if (context instanceof Response) {
      const payload = await context.json().catch(() => null)
      if (payload?.error) return { error: payload.error as string }
    }
    console.error(
      'manage-subscription failed:',
      await describeFunctionError(error)
    )
    return { error: GENERIC_ERROR }
  }
  return { data: data as Record<string, unknown> }
}

/**
 * Changes the plan. `manage-subscription` decides "now" vs "end of period" with the same
 * rules as `lib/plan-change.ts`; a workspace still on Free is sent to Checkout instead.
 */
export async function changePlanAction(
  orgSlug: string,
  input: {
    planId: string
    cycle: string
    requestId: string
    prorationDate?: number
  }
): Promise<ActionResult<PlanChangeOutcome>> {
  const workspace = await requireBillingAdmin(orgSlug)
  if (!workspace)
    return { ok: false, error: 'Only an admin can change the plan.' }

  const parsed = planChangeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Choose a plan.' }

  const planName = TIER_NAMES[parsed.data.planId]
  const result = await invokeManageSubscription({
    action: 'change',
    orgId: workspace.id,
    planName,
    cycle: parsed.data.cycle,
    requestId: parsed.data.requestId,
    prorationDate: parsed.data.prorationDate,
  })
  if ('error' in result)
    return { ok: false, error: result.error ?? GENERIC_ERROR }

  const { data } = result
  if (data.status === 'checkout_required') {
    try {
      const supabase = await createClient()
      const checkout = await createCheckoutSession(supabase, {
        planName,
        cycle: parsed.data.cycle,
        orgId: workspace.id,
        returnUrl: siteConfig.url,
        requestId: parsed.data.requestId,
      })
      if (!checkout.url) {
        return { ok: false, error: checkout.message ?? GENERIC_ERROR }
      }
      return { ok: true, data: { status: 'checkout', url: checkout.url } }
    } catch (err) {
      if (err instanceof CheckoutServiceError) console.error(err.message)
      return { ok: false, error: 'Could not start checkout. Try again.' }
    }
  }

  revalidatePath(`/${orgSlug}/billing`)

  switch (data.status) {
    case 'switched':
      return {
        ok: true,
        data: {
          status: 'switched',
          renewsAt: (data.renewsAt as string) ?? null,
        },
      }
    case 'scheduled':
      return {
        ok: true,
        data: {
          status: 'scheduled',
          effectiveAt: (data.effectiveAt as string) ?? null,
        },
      }
    case 'payment_failed':
      return {
        ok: true,
        data: {
          status: 'payment_failed',
          invoiceUrl: (data.invoiceUrl as string) ?? null,
        },
      }
    default:
      return { ok: true, data: { status: 'unchanged' } }
  }
}

export type PlanChangePreview = {
  newPrice: number
  credit: number
  /** Existing account credit Stripe applies to this invoice. */
  accountCredit: number
  dueNow: number
  leftoverCredit: number
  currency: string
  prorationDate: number
}

/**
 * Stripe's exact amount for an immediate change, for the confirm step. Null when there is
 * nothing to prorate (Free goes through Checkout) - the dialog then keeps its estimate.
 */
export async function previewPlanChangeAction(
  orgSlug: string,
  input: { planId: string; cycle: string }
): Promise<ActionResult<PlanChangePreview | null>> {
  const workspace = await requireBillingAdmin(orgSlug)
  if (!workspace)
    return { ok: false, error: 'Only an admin can change the plan.' }

  const parsed = planChangeSchema
    .pick({ planId: true, cycle: true })
    .safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Choose a plan.' }

  const result = await invokeManageSubscription({
    action: 'preview',
    orgId: workspace.id,
    planName: TIER_NAMES[parsed.data.planId],
    cycle: parsed.data.cycle,
  })
  if ('error' in result)
    return { ok: false, error: result.error ?? GENERIC_ERROR }

  const preview = result.data.preview as PlanChangePreview | null | undefined
  return { ok: true, data: preview ?? null }
}

/** Cancels an upcoming (end-of-period) plan change. The current plan carries on. */
export async function cancelPlanChangeAction(
  orgSlug: string,
  requestId: string
): Promise<ActionResult> {
  const workspace = await requireBillingAdmin(orgSlug)
  if (!workspace)
    return { ok: false, error: 'Only an admin can change the plan.' }
  if (!z.uuid().safeParse(requestId).success) {
    return { ok: false, error: GENERIC_ERROR }
  }

  const result = await invokeManageSubscription({
    action: 'cancel_change',
    orgId: workspace.id,
    requestId,
  })
  if ('error' in result)
    return { ok: false, error: result.error ?? GENERIC_ERROR }

  revalidatePath(`/${orgSlug}/billing`)
  return { ok: true }
}

/**
 * Cancels the subscription at the END of the current period. The plan keeps working
 * until then, nothing is refunded, and "Keep my plan" can undo it; when it ends the
 * workspace moves to Free. A booked downgrade is dropped.
 */
export async function cancelSubscriptionAction(
  orgSlug: string,
  requestId: string
): Promise<ActionResult<{ cancelAt: string | null }>> {
  const workspace = await requireBillingAdmin(orgSlug)
  if (!workspace)
    return { ok: false, error: 'Only an admin can cancel the subscription.' }
  if (!z.uuid().safeParse(requestId).success) {
    return { ok: false, error: GENERIC_ERROR }
  }

  const result = await invokeManageSubscription({
    action: 'cancel',
    orgId: workspace.id,
    requestId,
  })
  if ('error' in result)
    return { ok: false, error: result.error ?? GENERIC_ERROR }

  revalidatePath(`/${orgSlug}/billing`)
  return {
    ok: true,
    data: { cancelAt: (result.data.cancelAt as string | null) ?? null },
  }
}

/**
 * "Keep my plan": undoes a cancel-at-period-end, so the subscription renews as normal.
 */
export async function resumeSubscriptionAction(
  orgSlug: string,
  requestId: string
): Promise<ActionResult> {
  const workspace = await requireBillingAdmin(orgSlug)
  if (!workspace)
    return { ok: false, error: 'Only an admin can change the plan.' }
  if (!z.uuid().safeParse(requestId).success) {
    return { ok: false, error: GENERIC_ERROR }
  }

  const result = await invokeManageSubscription({
    action: 'resume',
    orgId: workspace.id,
    requestId,
  })
  if ('error' in result)
    return { ok: false, error: result.error ?? GENERIC_ERROR }

  revalidatePath(`/${orgSlug}/billing`)
  return { ok: true }
}

/**
 * A link to Stripe's hosted "update payment method" page. Card details never touch this
 * app; the new card comes back through stripe-webhook.
 */
export async function openCardUpdateAction(
  orgSlug: string
): Promise<ActionResult<{ url: string }>> {
  const workspace = await requireBillingAdmin(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Only an admin can manage billing.' }
  }

  const result = await invokeManageSubscription({
    action: 'portal',
    orgId: workspace.id,
    returnUrl: `${siteConfig.url}/${orgSlug}/billing`,
  })
  if ('error' in result) {
    return {
      ok: false,
      error: result.error ?? 'Could not open Stripe. Try again.',
    }
  }

  const url = result.data.url
  if (typeof url !== 'string') {
    return { ok: false, error: 'Could not open Stripe. Try again.' }
  }
  return { ok: true, data: { url } }
}
