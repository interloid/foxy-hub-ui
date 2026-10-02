'use server'

import { describeFunctionError } from '@/features/onboarding/services/billing'
import type { ActionResult } from '@/features/onboarding/types'
import { getWorkspace } from '@/lib/dal'
import { demoBlocked } from '@/lib/demo'
import { isBillingRole } from '@/lib/role'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/** The `error` the Edge Function returned, for the toast; null when there is none. */
async function functionErrorMessage(error: Error): Promise<string | null> {
  const { context } = error as Error & { context?: unknown }
  if (!(context instanceof Response)) return null
  try {
    const body = await context.clone().json()
    return typeof body?.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

/**
 * Remind on the Invoices page: emails the client a payment reminder for one invoice, through
 * the `send-invoice-reminder` Edge Function. The function re-checks everything (role, status,
 * the 24-hour limit), so these checks only spare it a round trip.
 */
export async function sendInvoiceReminderAction(
  orgSlug: string,
  invoiceId: string
): Promise<ActionResult<{ sentTo: string }>> {
  if (!orgSlug || !z.guid().safeParse(invoiceId).success) {
    return { ok: false, error: 'Invalid invoice.' }
  }

  // The demo's client inboxes aren't real.
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }
  if (!isBillingRole(workspace.role)) {
    return {
      ok: false,
      error: 'Only the primary admin or an admin can send reminders.',
    }
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'You need to be signed in.' }
  }

  const { data, error } = await supabase.functions.invoke(
    'send-invoice-reminder',
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { invoiceId },
    }
  )

  if (error) {
    const message = await functionErrorMessage(error)
    console.error(
      'send-invoice-reminder failed:',
      await describeFunctionError(error)
    )
    return {
      ok: false,
      error: message ?? 'The reminder could not be sent. Please try again.',
    }
  }

  // The reminder shows in the dashboard's activity feed.
  revalidatePath(`/${orgSlug}`)
  return { ok: true, data: { sentTo: String(data?.sentTo ?? 'the client') } }
}
