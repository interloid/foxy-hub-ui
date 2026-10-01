import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEMO_DISABLED, isDemoCaller } from '../_shared/demo.ts'
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

  // Stripe and email are off for the shared demo workspace (see _shared/demo.ts).
  if (await isDemoCaller(supabase, user.id)) {
    return json({ success: false, error: DEMO_DISABLED }, 403)
  }

  let invoiceId: string | undefined
  let planId: string | undefined
  let orgId: string | undefined
  let returnUrl: string | undefined
  let requestId: string | undefined

  try {
    const body = await req.json()
    invoiceId = body.invoiceId
    planId = body.planId
    orgId = body.orgId
    returnUrl = body.returnUrl
    requestId = body.requestId
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
        // `{org}/invoices/{id}` has no route — this landed on a 404. The list page is
        // real, and `InvoicePaidBanner` there reads the query param.
        success_url: `${base}${orgPrefix}/invoices?payment=success`,
        cancel_url: `${base}${orgPrefix}/invoices?payment=cancelled`,
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

    // Land back on the org's own dashboard, not the bare origin — `/` just redirects to
    // it WITHOUT forwarding the query string, which would silently drop the success
    // signal below before PaymentSuccessCard ever saw it.
    let orgPrefix = ''
    if (orgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', orgId)
        .maybeSingle()
      if (org?.slug) orgPrefix = `/${org.slug}`
    }

    // Reuse the workspace's Stripe customer. `customer_email` alone makes Stripe create a
    // NEW customer on every checkout, and the webhook then overwrites
    // `stripe_customer_id` - splitting invoices and cards across customers and orphaning
    // any subscription still running on the old one.
    //
    // Read through the caller's own token: `owners_admins_view_subscription` returns the
    // row only to that workspace's primary admin or admin, so nobody can borrow another
    // workspace's customer by sending its orgId.
    let customerId: string | null = null
    if (orgId) {
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id, status')
        .eq('org_id', orgId)
        .maybeSingle()

      // Already paying: a second subscription would bill twice. Plan changes go through
      // manage-subscription instead.
      if (existing?.stripe_subscription_id && existing.status === 'active') {
        return json(
          {
            success: false,
            error:
              'This workspace already has a subscription. Change the plan from Billing & plan.',
          },
          409
        )
      }

      if (existing?.stripe_customer_id) {
        // A saved id Stripe does not know (seed data, or the other mode's id) falls back
        // to a new customer rather than failing the checkout.
        try {
          const customer = await stripe.customers.retrieve(
            existing.stripe_customer_id
          )
          if (!customer.deleted) customerId = customer.id
        } catch (err) {
          if ((err as { code?: string }).code !== 'resource_missing') throw err
          console.warn(
            `Saved Stripe customer ${existing.stripe_customer_id} not found; creating a new one`
          )
        }
      }
    }

    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.price_id,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        ...(customerId
          ? { customer: customerId }
          : { customer_email: user.email }),
        // `payment=success` — matches what PaymentSuccessCard actually checks
        // (src/components/billing/payment-success-card.tsx). `checkout=success` was never
        // read by anything.
        success_url: `${base}${orgPrefix}?payment=success`,
        cancel_url: `${base}${orgPrefix}?payment=canceled`,
        metadata: {
          plan_id: plan.id,
          org_id: orgId || '',
          user_id: user.id,
          pending_invitations: JSON.stringify(pendingInvitations),
        },
      },
      // Billing's Change plan sends a requestId: a double click or retry then gets the
      // SAME session back instead of a second one. Onboarding sends none and is unchanged.
      typeof requestId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          requestId
        )
        ? { idempotencyKey: `checkout:${orgId}:${plan.id}:${requestId}` }
        : undefined
    )

    return json({ url: session.url }, 200)
  } catch (err) {
    console.error('Stripe checkout creation failed:', (err as Error).message)
    return json(
      { success: false, error: 'Could not create checkout session' },
      502
    )
  }
})
