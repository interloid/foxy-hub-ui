import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

/**
 * Origin allowlist, comma separated:
 *   supabase secrets set ALLOWED_ORIGINS=https://app.example.com
 *
 * CORS still falls back to `*` when unset so local development keeps working —
 * authentication here is by Authorization header rather than cookie, so a wildcard is not
 * itself a CSRF hole. The REDIRECT no longer falls back that way; see below.
 *
 * Entries are NORMALISED to a bare origin. They used to be compared by exact string, which
 * made the variable unforgiving in both directions: `https://app.example.com/` with a
 * trailing slash matched nothing, so every payment failed with "Invalid return URL", while
 * a `returnUrl` carrying a path sailed past a list that happened to contain the same path.
 * Comparing origins is the comparison that was always meant.
 */
function toOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map(toOrigin)
  .filter((o): o is string => Boolean(o))

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = toOrigin(req.headers.get('Origin') ?? '') ?? ''
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

  // ANON key + the caller's token: every query below runs under their RLS, as them.
  // Never the service-role key — that would bypass the policy doing the authorising.
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
  let returnUrl: unknown
  try {
    ;({ invoiceId, returnUrl } = await req.json())
  } catch {
    return json({ error: 'Malformed JSON body' }, 400)
  }
  if (typeof invoiceId !== 'string' || invoiceId.length === 0) {
    return json({ error: 'invoiceId is required' }, 400)
  }

  // Where Stripe sends the payer afterwards. Reduced to an origin first — `toOrigin` is
  // what rejects a relative path, a javascript: scheme or anything unparseable, so the
  // separate validation that used to follow is no longer needed.
  const originHeader = req.headers.get('origin') ?? ''
  const requested =
    typeof returnUrl === 'string' && returnUrl ? returnUrl : originHeader
  const requestedOrigin = toOrigin(requested)

  if (!requestedOrigin) {
    console.error(`Rejected return URL "${requested}" — not an http(s) origin`)
    return json({ error: 'Invalid return URL' }, 400)
  }

  // With no allowlist the caller's own origin is taken on trust. That is the local-dev
  // fallback, and it is exactly what must not happen in production: a deployment that
  // forgets the variable would let any authenticated caller choose where Stripe redirects
  // after payment. So the fallback is refused whenever this is not a localhost origin.
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
    requestedOrigin
  )

  if (ALLOWED_ORIGINS.length === 0 && !isLocal) {
    console.error(
      'ALLOWED_ORIGINS is not configured — refusing to trust a caller-supplied return URL'
    )
    return json({ error: 'Checkout is not configured' }, 500)
  }

  if (
    ALLOWED_ORIGINS.length > 0 &&
    !ALLOWED_ORIGINS.includes(requestedOrigin)
  ) {
    console.error(
      `Rejected return URL "${requestedOrigin}" — not in ALLOWED_ORIGINS`
    )
    return json({ error: 'Invalid return URL' }, 400)
  }

  const base = requestedOrigin

  // RLS decides visibility. The organisation's slug routes the return URL; its name goes
  // on the Stripe invoice, which otherwise names only this platform account.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      'id, amount, currency, status, invoice_number, description, organizations(slug, name), projects(client_id, name)'
    )
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError) {
    console.error('invoice lookup failed:', invoiceError.message)
    return json({ error: 'Could not load invoice' }, 500)
  }
  if (!invoice) return json({ error: 'Invoice not found' }, 404)

  // Only unpaid invoices are payable.
  if (invoice.status !== 'due' && invoice.status !== 'overdue') {
    return json(
      { error: `Invoice is ${invoice.status} and cannot be paid` },
      409
    )
  }

  const minorUnits = Math.round(Number(invoice.amount) * 100)
  if (!Number.isFinite(minorUnits) || minorUnits <= 0) {
    return json({ error: 'Invoice amount is not chargeable' }, 409)
  }

  const project = invoice.projects as unknown as {
    client_id: string | null
    name: string | null
  } | null

  const clientId = project?.client_id
  const isClient = Boolean(clientId) && clientId === user.id
  const customerEmail = isClient ? user.email : undefined

  const organization = invoice.organizations as unknown as {
    slug: string
    name: string | null
  } | null

  const orgSlug = organization?.slug
  const orgPrefix = orgSlug ? `/${orgSlug}` : ''

  /**
   * Where Stripe drops the payer afterwards.
   *
   * This used to be `{org}/invoices/{id}` for everyone, which is a route that does not
   * exist: a client bounced off the `[org]` gate into the portal with no word about the
   * payment, and staff got a plain 404. The two apps need two destinations, and the
   * function already knows which one the payer is standing in.
   *
   * The client's page reads the invoice and copes with the row still being `due`, because
   * the webhook that flips it is a separate request that may not have landed yet.
   */
  const returnPath = isClient
    ? `/portal/${orgSlug}/invoices/${invoice.id}`
    : `${orgPrefix}/invoices`
  const orgName = organization?.name?.trim() || 'your agency'

  /**
   * What the payer sees on the Stripe invoice besides the amount.
   *
   * This is a single platform account, so every agency's client is billed by the same
   * merchant name — without these the document gives no clue WHO the work was for, and
   * `invoice_number` survives only inside a line-item string. The template's own custom
   * fields cannot do this: those are static text, identical on every invoice.
   *
   * Stripe caps custom fields at 4, with a 30-character name and 30-character value, and
   * rejects the whole request on an empty string — hence the truncation and the filter.
   */
  const customFields = [
    { name: 'Agency', value: orgName },
    { name: 'Reference', value: invoice.invoice_number ?? '' },
    { name: 'Project', value: project?.name ?? '' },
  ]
    .map((field) => ({
      name: field.name.slice(0, 30),
      value: field.value.trim().slice(0, 30),
    }))
    .filter((field) => field.value.length > 0)

  try {
    const session = await stripe.checkout.sessions.create(
      {
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: invoice.currency,
              product_data: {
                name: `Invoice ${invoice.invoice_number}`,
                ...(invoice.description
                  ? { description: invoice.description }
                  : {}),
              },
              unit_amount: minorUnits,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description: `${orgName} — ${invoice.invoice_number}`,
            footer: `Paid to ${orgName} via Foxy Hub. Questions about this work should go to ${orgName} directly.`,
            custom_fields: customFields,
            // Mirrors the session metadata, so the invoice object carries the same
            // reference as the event the webhook reads.
            metadata: { invoice_id: invoice.id },
          },
        },
        metadata: { invoice_id: invoice.id },
        success_url: `${base}${returnPath}?payment=success`,
        cancel_url: `${base}${returnPath}?payment=cancelled`,
      },
      {
        // Keyed on the invoice and its amount, so a double click, a retry or a second tab
        // all get the SAME session back rather than a second payable one. Without it a
        // client could pay twice; the second webhook would then collide on the unique
        // `payment_intent` and leave a real Stripe charge with nothing recording it.
        //
        // The amount is in the key so that a cancelled-and-reissued invoice at a different
        // total is a different session, rather than reusing one priced at the old figure.
        // The `v2` is a payload version, and it must be bumped whenever the session
        // arguments above change shape. Stripe rejects a key replayed with DIFFERENT
        // parameters — "keys for idempotent requests can only be used with the same
        // parameters they were first used with" — so without this, editing the return
        // URL or the invoice data breaks payment for every invoice already attempted,
        // until the key ages out 24 hours later.
        idempotencyKey: `invoice:v2:${invoice.id}:${minorUnits}`,
      }
    )

    return json({ url: session.url }, 200)
  } catch (error) {
    // Stripe's own wording, passed through. The generic string this used to return meant
    // the only copy of the reason sat in the Supabase dashboard logs, so a failure in the
    // app gave the caller nothing to act on. Stripe's messages describe the request, not
    // the account, and no key or secret appears in them.
    const stripeError = error as {
      message?: string
      code?: string
      type?: string
    }

    console.error('stripe session create failed:', {
      message: stripeError.message,
      code: stripeError.code,
      type: stripeError.type,
    })

    return json(
      {
        error: 'Could not start checkout',
        detail: stripeError.message ?? String(error),
        code: stripeError.code ?? stripeError.type ?? null,
      },
      502
    )
  }
})
