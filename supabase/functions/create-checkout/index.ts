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

  let invoiceId: string | undefined
  let planId: string | undefined
  let orgId: string | undefined
  let returnUrl: string | undefined

  try {
    const body = await req.json()
    invoiceId = body.invoiceId
    planId = body.planId
    orgId = body.orgId
    returnUrl = body.returnUrl
  } catch {
    return json({ success: false, error: 'Malformed JSON body' }, 400)
  }

  // Neither invoiceId nor planId were provided
  if (!invoiceId && !planId) {
    return json(
      { success: false, error: 'Either invoiceId or planId is required' },
      400
    )
  }

  // Determine base return URL
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
    return json({ success: false, error: 'Invalid return URL' }, 400)
  }

  const pendingInvitations = Array.isArray(
    user.user_metadata?.pending_invitations
  )
    ? user.user_metadata.pending_invitations
    : []

  try {
    // Branch 1: If invoiceId is provided, handle as One-time Invoice Payment
    if (invoiceId) {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, organizations(slug, id)')
        .eq('id', invoiceId)
        .maybeSingle()

      if (invoiceError || !invoice) {
        return json({ success: false, error: 'Invoice not found' }, 404)
      }

      const org = invoice.organizations as unknown as {
        slug: string
        id: string
      } | null
      const orgPrefix = org?.slug ? `/${org.slug}` : ''

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
        cancel_url: `${base}${orgPrefix}/invoices/${invoice.id}?payment=canceled`,
        metadata: {
          invoice_id: invoice.id,
          org_id: org?.id || '',
          user_id: user.id,
          pending_invitations: JSON.stringify(pendingInvitations),
        },
      })

      return json({ url: session.url }, 200)
    }

    // Branch 2: Handle as Subscription Plan Checkout (planId)
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle()

    if (planError || !plan || !plan.price_id) {
      return json({ success: false, error: 'Invalid or free plan' }, 400)
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.price_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      customer_email: user.email,
      success_url: `${base}?checkout=success`,
      cancel_url: `${base}?checkout=canceled`,
      metadata: {
        plan_id: plan.id,
        org_id: orgId || '',
        user_id: user.id,
        pending_invitations: JSON.stringify(pendingInvitations),
      },
    })

    return json({ url: session.url }, 200)
  } catch (err) {
    console.error('Stripe checkout creation failed:', (err as Error).message)
    return json(
      { success: false, error: 'Could not create checkout session' },
      502
    )
  }
})
