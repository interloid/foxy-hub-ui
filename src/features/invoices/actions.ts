'use server'

import { describeFunctionError } from '@/features/onboarding/services/billing'
import type { ActionResult } from '@/features/onboarding/types'
import { issueInvoiceAction } from '@/features/portal/actions'
import { actorNameOf, logActivity } from '@/lib/activity'
import { getWorkspace, verifySession } from '@/lib/dal'
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

export interface BulkInvoiceResult {
  done: number
  /** One line per invoice that didn't go through, for the toast. */
  failures: { number: string; error: string }[]
}

const invoiceIdsSchema = z.array(z.guid()).min(1).max(100)

/** The checks every bulk action shares: valid ids, not the demo, a billing role. */
async function bulkGuard(
  orgSlug: string,
  invoiceIds: string[],
  verb: string
): Promise<
  | {
      ok: true
      workspace: NonNullable<Awaited<ReturnType<typeof getWorkspace>>>
    }
  | { ok: false; error: string }
> {
  if (!orgSlug || !invoiceIdsSchema.safeParse(invoiceIds).success) {
    return { ok: false, error: 'Select at least one invoice.' }
  }
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }
  if (!isBillingRole(workspace.role)) {
    return {
      ok: false,
      error: `Only the primary admin or an admin can ${verb}.`,
    }
  }
  return { ok: true, workspace }
}

async function invoiceNumbers(ids: string[]) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, project_id')
    .in('id', ids)
  return new Map((data ?? []).map((row) => [row.id, row]))
}

/**
 * Send drafts: issues each draft as a Stripe invoice, then moves it to `due` (Sent). An
 * invoice that is no longer a draft is skipped, not re-sent.
 */
export async function sendDraftInvoicesAction(
  orgSlug: string,
  invoiceIds: string[]
): Promise<ActionResult<BulkInvoiceResult>> {
  const guard = await bulkGuard(orgSlug, invoiceIds, 'send invoices')
  if (!guard.ok) return guard

  const supabase = await createClient()
  const session = await verifySession()
  const rows = await invoiceNumbers(invoiceIds)
  const actor = session ? await actorNameOf(supabase, session.id) : null
  const result: BulkInvoiceResult = { done: 0, failures: [] }

  for (const id of invoiceIds) {
    const row = rows.get(id)
    const number = row?.invoice_number ?? 'Invoice'
    if (!row || row.status !== 'draft') {
      result.failures.push({ number, error: 'is not a draft' })
      continue
    }

    const issued = await issueInvoiceAction(id)
    if (!issued.ok) {
      result.failures.push({ number, error: issued.error })
      continue
    }

    const { error } = await supabase
      .from('invoices')
      .update({ status: 'due' })
      .eq('id', id)
      .eq('status', 'draft')

    if (error) {
      console.error(`invoice ${id} issued but still draft:`, error.message)
      result.failures.push({ number, error: 'was issued but not marked sent' })
      continue
    }

    result.done += 1
    if (session && actor) {
      await logActivity(supabase, {
        orgId: guard.workspace.id,
        actorId: session.id,
        actorKind: 'member',
        type: 'invoice_sent',
        summary: `${actor} sent ${number} to the client`,
        projectId: row.project_id,
        entityType: 'invoice',
        entityId: id,
        changes: [{ label: 'Status', from: 'Draft', to: 'Sent' }],
      })
    }
  }

  revalidatePath(`/${orgSlug}/invoices`)
  revalidatePath(`/${orgSlug}`)
  return { ok: true, data: result }
}

/** Send reminders: the single Remind, once per invoice. Each one keeps its own 24h limit. */
export async function sendInvoiceRemindersAction(
  orgSlug: string,
  invoiceIds: string[]
): Promise<ActionResult<BulkInvoiceResult>> {
  const guard = await bulkGuard(orgSlug, invoiceIds, 'send reminders')
  if (!guard.ok) return guard

  const rows = await invoiceNumbers(invoiceIds)
  const result: BulkInvoiceResult = { done: 0, failures: [] }

  for (const id of invoiceIds) {
    const res = await sendInvoiceReminderAction(orgSlug, id)
    if (res.ok) result.done += 1
    else
      result.failures.push({
        number: rows.get(id)?.invoice_number ?? 'Invoice',
        error: res.error,
      })
  }

  return { ok: true, data: result }
}

/**
 * Mark paid: money that arrived outside Stripe. Goes through `mark-invoice-paid`, which
 * closes the Stripe invoice too, so the client can't pay the same bill twice.
 */
export async function markInvoicesPaidAction(
  orgSlug: string,
  invoiceIds: string[]
): Promise<ActionResult<BulkInvoiceResult>> {
  const guard = await bulkGuard(orgSlug, invoiceIds, 'mark invoices paid')
  if (!guard.ok) return guard

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'You need to be signed in.' }
  }

  const rows = await invoiceNumbers(invoiceIds)
  const result: BulkInvoiceResult = { done: 0, failures: [] }

  for (const id of invoiceIds) {
    const { error } = await supabase.functions.invoke('mark-invoice-paid', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { invoiceId: id },
    })

    if (error) {
      console.error(
        'mark-invoice-paid failed:',
        await describeFunctionError(error)
      )
      result.failures.push({
        number: rows.get(id)?.invoice_number ?? 'Invoice',
        error:
          (await functionErrorMessage(error)) ?? 'could not be marked paid',
      })
    } else {
      result.done += 1
    }
  }

  revalidatePath(`/${orgSlug}/invoices`)
  revalidatePath(`/${orgSlug}`)
  return { ok: true, data: result }
}

/**
 * The invoice's status as the lists show it - what Pay as client polls while the Stripe
 * tab is open, until the webhook has marked it paid.
 */
export async function getInvoiceStatusAction(
  orgSlug: string,
  invoiceId: string
): Promise<ActionResult<{ paid: boolean }>> {
  if (!orgSlug || !z.guid().safeParse(invoiceId).success) {
    return { ok: false, error: 'Invalid invoice.' }
  }
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .eq('org_id', workspace.id)
    .maybeSingle()

  if (error || !data) return { ok: false, error: 'Invoice not found.' }
  return { ok: true, data: { paid: data.status === 'paid' } }
}

/**
 * Void: cancels the invoice and frees what it billed. Goes through `void-invoice`, which
 * voids the Stripe invoice first so its payment link stops working, then cancels the row
 * and releases its hours for the next invoice.
 */
export async function voidInvoiceAction(
  orgSlug: string,
  invoiceId: string
): Promise<ActionResult<{ released: number }>> {
  const guard = await bulkGuard(orgSlug, [invoiceId], 'void invoices')
  if (!guard.ok) return guard

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'You need to be signed in.' }
  }

  const { data, error } = await supabase.functions.invoke('void-invoice', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { invoiceId },
  })

  if (error) {
    console.error('void-invoice failed:', await describeFunctionError(error))
    return {
      ok: false,
      error:
        (await functionErrorMessage(error)) ??
        'The invoice could not be voided. Please try again.',
    }
  }

  revalidatePath(`/${orgSlug}/invoices`)
  revalidatePath(`/${orgSlug}/invoices/${invoiceId}`)
  revalidatePath(`/${orgSlug}`)
  return { ok: true, data: { released: Number(data?.released) || 0 } }
}
