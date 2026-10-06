import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEMO_DISABLED, isDemoCaller } from '../_shared/demo.ts'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

/**
 * Mark paid on the Invoices page: the client paid some other way (bank transfer, cash).
 *
 * The row alone is not enough. An issued invoice has a live Stripe page, and flipping only
 * the app's status would leave that page payable - the client could pay a second time. So
 * the Stripe invoice is settled first, `paid_out_of_band`, which closes the page without
 * moving money, and only then is the row written.
 *
 * `invoice.paid` still arrives from Stripe afterwards; the webhook finds the row already
 * paid and writes no second feed line.
 */

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((value) => {
    try {
      return new URL(value.trim()).origin
    } catch {
      return null
    }
  })
  .filter((value): value is string => Boolean(value))

function corsHeadersFor(req: Request): Record<string, string> {
  let origin = ''
  try {
    origin = new URL(req.headers.get('Origin') ?? '').origin
  } catch {
    origin = ''
  }

  const allow =
    ALLOWED_ORIGINS.length === 0
      ? '*'
      : origin && ALLOWED_ORIGINS.includes(origin)
        ? origin
        : ''

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  // The caller's own token: RLS authorises every read and write, and the invoice UPDATE
  // (`owners_admins_update_invoices`) is primary admin + admin only - billing.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return json({ error: 'Invalid token' }, 401)

  if (await isDemoCaller(supabase, user.id)) {
    return json({ error: DEMO_DISABLED }, 403)
  }

  let invoiceId: unknown
  try {
    ;({ invoiceId } = await req.json())
  } catch {
    return json({ error: 'Malformed JSON body' }, 400)
  }
  if (typeof invoiceId !== 'string' || !invoiceId) {
    return json({ error: 'invoiceId is required' }, 400)
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, status, due_date, stripe_invoice_id, org_id, project_id'
    )
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError) {
    console.error('invoice lookup failed:', invoiceError.message)
    return json({ error: 'Could not load invoice' }, 500)
  }
  if (!invoice) return json({ error: 'Invoice not found' }, 404)

  if (invoice.status === 'paid') return json({ alreadyPaid: true }, 200)
  if (invoice.status === 'cancelled') {
    return json({ error: 'Invoice is cancelled' }, 409)
  }

  // Checked before Stripe is touched: the row's UPDATE policy would refuse a manager, but
  // only after the Stripe invoice had already been closed.
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', invoice.org_id)
    .eq('user_id', user.id)
    .eq('status', true)
    .maybeSingle()

  if (!membership || !['primary_admin', 'admin'].includes(membership.role)) {
    return json(
      { error: 'Only the primary admin or an admin can mark invoices paid.' },
      403
    )
  }

  if (invoice.stripe_invoice_id) {
    try {
      const stripeInvoice = await stripe.invoices.retrieve(
        invoice.stripe_invoice_id
      )
      if (stripeInvoice.status === 'open') {
        await stripe.invoices.pay(invoice.stripe_invoice_id, {
          paid_out_of_band: true,
        })
      } else if (stripeInvoice.status !== 'paid') {
        return json(
          {
            error: `The Stripe invoice is ${stripeInvoice.status}, so it cannot be marked paid.`,
          },
          409
        )
      }
    } catch (err) {
      console.error(
        `stripe pay out of band failed for ${invoice.stripe_invoice_id}:`,
        (err as Error).message
      )
      return json({ error: 'Stripe refused to mark the invoice paid.' }, 502)
    }
  }

  // `neq('status', 'paid')` so a webhook that settled it in the meantime keeps its line.
  const { data: updated, error: updateError } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', invoice.id)
    .neq('status', 'paid')
    .select('id')

  if (updateError) {
    console.error(`could not mark ${invoice.id} paid:`, updateError.message)
    return json({ error: 'Could not update the invoice' }, 500)
  }

  if (updated && updated.length > 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    const actor = profile?.full_name?.trim() || 'Someone'
    const wasOverdue =
      invoice.status === 'overdue' ||
      (invoice.status === 'due' &&
        invoice.due_date !== null &&
        new Date(invoice.due_date) < new Date())
    const was =
      invoice.status === 'draft' ? 'Draft' : wasOverdue ? 'Overdue' : 'Sent'

    const { error: feedError } = await supabase.from('activity_events').insert({
      org_id: invoice.org_id,
      actor_id: user.id,
      actor_kind: 'member',
      type: 'invoice_paid',
      summary: `${actor} marked ${invoice.invoice_number} as paid`,
      project_id: invoice.project_id,
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload: {
        invoice_number: invoice.invoice_number,
        changes: [{ label: 'Status', from: was, to: 'Paid' }],
        note: 'Paid outside Stripe',
      },
    })
    if (feedError) {
      console.error(
        'activity_events insert failed (invoice_paid):',
        feedError.message
      )
    }
  }

  return json({ ok: true }, 200)
})
