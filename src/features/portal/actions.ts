'use server'

import { siteConfig } from '@/config/site'
import { describeFunctionError } from '@/features/onboarding/services/billing'
import type { ActionResult } from '@/features/onboarding/types'
import { createClient } from '@/lib/supabase/server'

export async function issueInvoiceAction(
  invoiceId: string
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return { ok: false, error: 'You need to be signed in.' }
  }

  const { data, error } = await supabase.functions.invoke('issue-invoice', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { invoiceId },
  })

  if (error) {
    console.error('issue-invoice failed:', await describeFunctionError(error))
    return {
      ok: false,
      error: 'The invoice was saved, but could not be sent to Stripe.',
    }
  }

  if (!data?.url) {
    return { ok: false, error: 'Stripe did not return an invoice link.' }
  }

  return { ok: true, data: { url: data.url as string } }
}

export async function startInvoicePaymentAction(
  invoiceId: string
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return { ok: false, error: 'You need to be signed in to pay an invoice.' }
  }

  const { data, error } = await supabase.functions.invoke('create-invoice', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: {
      invoiceId,
      returnUrl: siteConfig.url,
    },
  })

  if (error) {
    console.error('create-invoice failed:', await describeFunctionError(error))
    return {
      ok: false,
      error: 'Could not start the payment. Please try again.',
    }
  }

  if (!data?.url) {
    return { ok: false, error: 'Checkout did not return a payment link.' }
  }

  return { ok: true, data: { url: data.url as string } }
}
