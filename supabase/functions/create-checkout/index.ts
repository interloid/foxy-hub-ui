import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

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
  if (!authHeader) {
    return json({ success: false, error: 'Missing Authorization header' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_ANON_KEY') || '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return json({ success: false, message: 'Invalid token' }, 401)
  }

  let invoiceId: unknown
  let returnUrl: unknown
  try {
    ;({ invoiceId, returnUrl } = await req.json())
  } catch {
    return json({ success: false, error: 'Malformed JSON body' }, 400)
  }

  if (typeof invoiceId !== 'string' || !invoiceId) {
    return json({ success: false, error: 'invoiceId is required' }, 400)
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
    return json({ success: false, error: 'Invalid return URL' }, 400)
  }

  let parsedBase: URL
  try {
    parsedBase = new URL(base)
  } catch {
    console.error(`Rejected return URL "${base}" — not a valid absolute URL`)
    return json({ success: false, error: 'Invalid return URL' }, 400)
  }
  if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
    console.error(
      `Rejected return URL "${base}" — scheme "${parsedBase.protocol}" is not http(s)`
    )
    return json({ success: false, error: 'Invalid return URL' }, 400)
  }

  // Load invoice and include organization slug for routing
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*, organizations(slug)')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError || !invoice) {
    return json({ success: false, error: 'Invoice not found' }, 404)
  }

  const orgSlug = (invoice.organizations as unknown as { slug: string } | null)
    ?.slug
  const orgPrefix = orgSlug ? `/${orgSlug}` : ''

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (invoice.currency as string) || 'usd',
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
            },
            unit_amount: Math.round(Number(invoice.amount) * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: user.email,
      success_url: `${base}${orgPrefix}/invoices/${invoice.id}?payment=success`,
      cancel_url: `${base}${orgPrefix}/invoices/${invoice.id}?payment=cancelled`,
      metadata: { invoice_id: invoice.id },
    })

    return json({ url: session.url }, 200)
  } catch (err) {
    console.error(
      'Stripe create-invoice session failed:',
      (err as Error).message
    )
    return json(
      { success: false, error: 'Could not create invoice checkout session' },
      502
    )
  }
})
