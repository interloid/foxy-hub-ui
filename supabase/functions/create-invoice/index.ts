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
 * Falls back to `*` when unset so local development keeps working. Authentication here is
 * by Authorization header rather than cookie, so a wildcard is not itself a CSRF hole —
 * pinning the origin just removes a free layer of defence.
 */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allow =
    ALLOWED_ORIGINS.length === 0
      ? '*'
      : ALLOWED_ORIGINS.includes(origin)
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

  // Determine base URL safely using ALLOWED_ORIGINS or caller-supplied returnUrl
  const originHeader = req.headers.get('origin') ?? ''
  const requested =
    typeof returnUrl === 'string' && returnUrl ? returnUrl : originHeader

  const base =
    ALLOWED_ORIGINS.length > 0
      ? ALLOWED_ORIGINS.includes(requested)
        ? requested
        : ''
      : requested

  if (!base) {
    console.error(`Rejected return URL "${requested}" — not in ALLOWED_ORIGINS`)
    return json({ error: 'Invalid return URL' }, 400)
  }

  let parsedBase: URL
  try {
    parsedBase = new URL(base)
  } catch {
    console.error(`Rejected return URL "${base}" — not a valid absolute URL`)
    return json({ error: 'Invalid return URL' }, 400)
  }
  if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
    console.error(
      `Rejected return URL "${base}" — scheme "${parsedBase.protocol}" is not http(s)`
    )
    return json({ error: 'Invalid return URL' }, 400)
  }

  // RLS decides visibility. Also fetch organization slug for proper routing.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      'id, amount, currency, status, invoice_number, description, organizations(slug), projects(client_id)'
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

  const clientId = (invoice.projects as { client_id: string | null } | null)
    ?.client_id
  const customerEmail = clientId === user.id ? user.email : undefined

  const orgSlug = (invoice.organizations as unknown as { slug: string } | null)
    ?.slug
  const orgPrefix = orgSlug ? `/${orgSlug}` : ''

  try {
    const session = await stripe.checkout.sessions.create({
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
      invoice_creation: { enabled: true },
      metadata: { invoice_id: invoice.id },
      success_url: `${base}${orgPrefix}/invoices/${invoice.id}?payment=success`,
      cancel_url: `${base}${orgPrefix}/invoices/${invoice.id}?payment=canceled`,
    })

    return json({ url: session.url }, 200)
  } catch (error) {
    console.error('stripe session create failed:', (error as Error).message)
    return json({ error: 'Could not start checkout' }, 502)
  }
})
