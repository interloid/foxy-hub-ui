import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export class CheckoutServiceError extends Error {}

/** Either a Stripe URL to send them to, or a message explaining why there isn't one. */
export type CheckoutResult = { url: string | null; message?: string }

export async function createCheckoutSession(
  supabase: SupabaseClient,
  params: {
    planName: string
    cycle: 'monthly' | 'yearly'
    orgId: string
    /** Passed in so this module never reads `process.env`. */
    returnUrl: string
  }
): Promise<CheckoutResult> {
  const { data: plan } = await supabase
    .from('plans')
    .select('id, price_id')
    .eq('name', params.planName)
    .eq('duration_months', params.cycle === 'yearly' ? 12 : 1)
    .eq('is_active', true)
    .maybeSingle()

  if (!plan) {
    throw new CheckoutServiceError(
      `No active ${params.planName} plan for ${params.cycle} billing.`
    )
  }

  if (!plan.price_id) {
    return { url: null, message: 'Your workspace is ready on the free plan.' }
  }

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { planId: plan.id, orgId: params.orgId, returnUrl: params.returnUrl },
  })

  if (error) {
    // The reason is in the response BODY, never in `error.message` — see `describeFunctionError`.
    throw new CheckoutServiceError(await describeFunctionError(error))
  }
  // The function answers business-rule refusals with 200 + { success: false, message }.
  if (data?.success === false)
    return { url: null, message: data.message as string }
  if (!data?.url)
    throw new CheckoutServiceError('Checkout did not return a URL.')

  return { url: data.url as string }
}

export async function describeFunctionError(error: Error): Promise<string> {
  const { context } = error as Error & { context?: unknown }
  if (!(context instanceof Response)) return error.message

  const body = await context.text().catch(() => '')
  return `${error.message} — HTTP ${context.status}${body ? ` ${body}` : ''}`
}
