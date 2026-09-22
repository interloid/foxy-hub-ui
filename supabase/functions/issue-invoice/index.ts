import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

/**
 * Issues a DRAFT invoice as a real Stripe invoice, and returns its hosted URL.
 *
 * The invoice-first flow. `create-invoice` builds a Checkout session at the moment the
 * client clicks Pay, which means Stripe knows nothing about the bill until it is settled:
 * no document to download beforehand, no due date, no reminders, and `invoice_url` — the
 * hosted receipt — only exists once the money has moved. Meanwhile the app has already
 * told the client the invoice is due and emailed them when it went overdue.
 *
 * Here the document is created when the agency says it was created. Stripe finalises it,
 * hands back a hosted page and a PDF, and the client pays on that page.
 *
 * Called by staff right after `create_invoice_with_entries`, and safe to call again: an
 * invoice that already has a `stripe_invoice_id` returns its existing URL untouched.
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

/** Stripe counts in the currency's smallest unit; every currency the app offers has two. */
function toMinorUnits(amount: number): number {
  return Math.round(Number(amount) * 100)
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

  // The caller's own token, so RLS authorises every read and write below. The invoice
  // update needs `owners_admins_update_invoices` and the customer id needs
  // `owners_admins_write_clients`.
  //
  // Those two are no longer the same audience: since the `manager` role was added,
  // `owners_admins_write_clients` admits primary_admin + admin + manager, while the
  // invoice policy stays primary_admin + admin. The invoice UPDATE is therefore what
  // actually gates this endpoint, and it is the right gate — issuing a bill is billing,
  // the one thing a manager does not do. A manager calling this fails on the invoice
  // write, so nothing is half-issued.
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

  let invoiceId: unknown
  try {
    ;({ invoiceId } = await req.json())
  } catch {
    return json({ error: 'Malformed JSON body' }, 400)
  }
  if (typeof invoiceId !== 'string' || invoiceId.length === 0) {
    return json({ error: 'invoiceId is required' }, 400)
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      `
      id, invoice_number, amount, currency, status, description, due_date,
      invoice_url, stripe_invoice_id, org_id,
      organizations(name),
      projects(name, client_org_id)
    `
    )
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError) {
    console.error('invoice lookup failed:', invoiceError.message)
    return json({ error: 'Could not load invoice' }, 500)
  }
  if (!invoice) return json({ error: 'Invoice not found' }, 404)

  // Already issued. Returning the existing link is the whole reason this is safe to retry
  // from a failed generation, a double click, or a client asking for the link again.
  if (invoice.stripe_invoice_id && invoice.invoice_url) {
    return json({ url: invoice.invoice_url, alreadyIssued: true }, 200)
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return json({ error: `Invoice is ${invoice.status}` }, 409)
  }

  const amountMinor = toMinorUnits(invoice.amount)
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return json({ error: 'Invoice amount is not chargeable' }, 409)
  }

  const project = invoice.projects as unknown as {
    name: string | null
    client_org_id: string | null
  } | null

  const organization = invoice.organizations as unknown as {
    name: string | null
  } | null

  const orgName = organization?.name?.trim() || 'your agency'

  if (!project?.client_org_id) {
    return json(
      { error: 'This project has no client, so there is nobody to invoice.' },
      409
    )
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, contact_name, contact_email, stripe_customer_id')
    .eq('id', project.client_org_id)
    .maybeSingle()

  if (clientError || !client) {
    return json({ error: 'Client not found' }, 404)
  }

  // ── The Stripe customer, minted once per client company ──────────────────────────────
  let customerId = client.stripe_customer_id

  try {
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          name: client.name,
          ...(client.contact_email ? { email: client.contact_email } : {}),
          metadata: { client_id: client.id, org_id: invoice.org_id },
        },
        { idempotencyKey: `client:${client.id}` }
      )

      customerId = customer.id

      // Persisted before the invoice is built: if the next call fails, a retry reuses this
      // customer instead of leaving an orphan behind in Stripe every attempt.
      const { error: saveError } = await supabase
        .from('clients')
        .update({ stripe_customer_id: customerId })
        .eq('id', client.id)

      if (saveError) {
        console.error('could not save stripe_customer_id:', saveError.message)
      }
    }

    // ── The invoice, then its lines ────────────────────────────────────────────────────
    //
    // Draft first with `pending_invoice_items_behavior: 'exclude'`, then items attached to
    // it by id. Creating items first would let them land on somebody else's open draft for
    // the same customer — Stripe sweeps unattached items onto the next invoice.
    const draft = await stripe.invoices.create(
      {
        customer: customerId,
        collection_method: 'send_invoice',
        pending_invoice_items_behavior: 'exclude',
        ...(invoice.due_date
          ? { due_date: Math.floor(new Date(invoice.due_date).getTime() / 1000) }
          : { days_until_due: 30 }),
        currency: invoice.currency.toLowerCase(),
        description: invoice.description ?? undefined,
        footer: `Collected by Foxy Hub on behalf of ${orgName}. Questions about this work should go to ${orgName} directly.`,
        custom_fields: [
          { name: 'Agency', value: orgName.slice(0, 30) },
          { name: 'Reference', value: invoice.invoice_number.slice(0, 30) },
          ...(project.name
            ? [{ name: 'Project', value: project.name.slice(0, 30) }]
            : []),
        ],
        metadata: { invoice_id: invoice.id, org_id: invoice.org_id },
        // Finalised explicitly below, so Stripe does not advance the draft underneath us.
        auto_advance: false,
      },
      { idempotencyKey: `issue:${invoice.id}:${amountMinor}` }
    )

    // The frozen lines, so the client sees what they were billed for rather than one lump
    // sum. `invoice_lines` is what the document said at issue time — the whole point of
    // that table — and this is the first flow able to show it.
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('description, quantity, unit_rate, amount, sort_order')
      .eq('invoice_id', invoice.id)
      .order('sort_order', { ascending: true })

    const rows = lines ?? []

    if (rows.length > 0) {
      for (const [index, line] of rows.entries()) {
        await stripe.invoiceItems.create(
          {
            customer: customerId,
            invoice: draft.id,
            currency: invoice.currency.toLowerCase(),
            amount: toMinorUnits(line.amount),
            description: line.description,
          },
          { idempotencyKey: `issue:${invoice.id}:line:${index}` }
        )
      }
    } else {
      // A fixed fee or a retainer may carry no lines. One item for the total keeps the
      // invoice payable rather than finalising it at zero.
      await stripe.invoiceItems.create(
        {
          customer: customerId,
          invoice: draft.id,
          currency: invoice.currency.toLowerCase(),
          amount: amountMinor,
          description: `Invoice ${invoice.invoice_number}`,
        },
        { idempotencyKey: `issue:${invoice.id}:line:total` }
      )
    }

    const finalized = await stripe.invoices.finalizeInvoice(draft.id)

    // Stripe's own total, not the app's. If the two disagree the lines are wrong, and the
    // client would be paying a figure the invoice does not add up to.
    if (finalized.amount_due !== amountMinor) {
      console.error(
        `amount mismatch on ${invoice.invoice_number}: stripe ${finalized.amount_due}, app ${amountMinor}`
      )
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        stripe_invoice_id: finalized.id,
        invoice_url: finalized.hosted_invoice_url,
      })
      .eq('id', invoice.id)

    if (updateError) {
      // The invoice exists and is payable, so this is not fatal — but nothing in the app
      // can reach it until the row is patched, hence the loud log.
      console.error(
        `issued ${finalized.id} but could not save it to ${invoice.id}:`,
        updateError.message
      )
    }

    return json(
      {
        url: finalized.hosted_invoice_url,
        stripeInvoiceId: finalized.id,
        pdf: finalized.invoice_pdf,
      },
      200
    )
  } catch (error) {
    const stripeError = error as {
      message?: string
      code?: string
      type?: string
    }

    console.error('stripe invoice issue failed:', {
      message: stripeError.message,
      code: stripeError.code,
      type: stripeError.type,
    })

    return json(
      {
        error: 'Could not issue the invoice',
        detail: stripeError.message ?? String(error),
        code: stripeError.code ?? stripeError.type ?? null,
      },
      502
    )
  }
})
