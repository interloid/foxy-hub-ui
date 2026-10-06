import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEMO_DISABLED, isDemoCaller } from '../_shared/demo.ts'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

/**
 * Void on the invoice page: the invoice was raised in error, or for the wrong amount.
 *
 * Stripe first. An issued invoice has a live hosted page, and voiding only the app's row
 * would leave that page payable. Stripe voids an open invoice (and deletes a draft), so the
 * link stops taking money; only then does `void_invoice` cancel the row and release the
 * hours it billed for the next invoice.
 *
 * Safe to retry: a Stripe invoice that is already void is skipped, and `void_invoice`
 * returns early on an invoice that is already cancelled.
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

  // The caller's own token: RLS and `void_invoice`'s role check both run as them.
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

  if (invoice.status === 'cancelled') return json({ alreadyVoid: true }, 200)
  if (invoice.status === 'paid') {
    return json({ error: 'A paid invoice cannot be voided.' }, 409)
  }

  // Checked before Stripe is touched, so a refused caller can't void the Stripe side only.
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', invoice.org_id)
    .eq('user_id', user.id)
    .eq('status', true)
    .maybeSingle()

  if (!membership || !['primary_admin', 'admin'].includes(membership.role)) {
    return json(
      { error: 'Only the primary admin or an admin can void invoices.' },
      403
    )
  }

  if (invoice.stripe_invoice_id) {
    try {
      const stripeInvoice = await stripe.invoices.retrieve(
        invoice.stripe_invoice_id
      )
      if (stripeInvoice.status === 'paid') {
        // Paid in Stripe but the webhook hasn't landed yet - voiding now would cancel money
        // that has already moved.
        return json(
          {
            error: 'Stripe shows this invoice as paid, so it cannot be voided.',
          },
          409
        )
      }
      if (
        stripeInvoice.status === 'open' ||
        stripeInvoice.status === 'uncollectible'
      ) {
        await stripe.invoices.voidInvoice(invoice.stripe_invoice_id)
      } else if (stripeInvoice.status === 'draft') {
        await stripe.invoices.del(invoice.stripe_invoice_id)
      }
      // 'void': already done by an earlier attempt.
    } catch (err) {
      console.error(
        `stripe void failed for ${invoice.stripe_invoice_id}:`,
        (err as Error).message
      )
      return json({ error: 'Stripe refused to void the invoice.' }, 502)
    }
  }

  const { data: released, error: voidError } = await supabase.rpc(
    'void_invoice',
    { p_invoice_id: invoice.id }
  )

  if (voidError) {
    // Stripe is already void at this point, so the link can't take money; retrying is safe
    // and finishes the app side.
    console.error(`void_invoice failed for ${invoice.id}:`, voidError.message)
    return json(
      {
        error:
          voidError.code === '22023'
            ? voidError.message
            : 'The Stripe invoice was voided, but the invoice could not be updated. Try again.',
      },
      500
    )
  }

  const releasedCount = Number(released) || 0

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
    type: 'invoice_voided',
    summary: `${actor} voided ${invoice.invoice_number}`,
    project_id: invoice.project_id,
    entity_type: 'invoice',
    entity_id: invoice.id,
    payload: {
      invoice_number: invoice.invoice_number,
      released_entries: releasedCount,
      changes: [{ label: 'Status', from: was, to: 'Cancelled' }],
      ...(releasedCount > 0
        ? {
            note: `${releasedCount} time ${releasedCount === 1 ? 'entry' : 'entries'} released for re-billing`,
          }
        : {}),
    },
  })
  if (feedError) {
    console.error(
      'activity_events insert failed (invoice_voided):',
      feedError.message
    )
  }

  return json({ ok: true, released: releasedCount }, 200)
})
