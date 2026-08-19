import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

/**
 * Origin allowlist, comma separated: `supabase secrets set ALLOWED_ORIGINS=https://app.example.com`
 *
 * Falls back to `*` when unset so local development and existing deploys keep working.
 * These endpoints authenticate by Authorization header rather than cookies, so a wildcard
 * is not itself a CSRF hole — but pinning the origin removes a free layer of defence.
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

/**
 * Upgrade/downgrade ordering. Retuned to the design's tiers, which replaced
 * Free / Pro / Enterprise in `20260807150000_reseed_design_plans.sql`.
 *
 * `Free` is 0, not 1: every workspace starts there (the signup trigger creates it before
 * any plan is chosen), so moving Free -> Starter has to read as an upgrade. Leaving the old
 * names here would have made `PLAN_TIERS[plan.name]` `undefined` for every real plan, and
 * `undefined < undefined` is false — so the downgrade guard would have silently passed
 * everything.
 */
const PLAN_TIERS = {
  Free: 0,
  Starter: 1,
  Studio: 2,
  Agency: 3,
} as const

/**
 * Starts a Stripe Checkout session for an organisation's subscription.
 *
 * The caller names the org. Authorisation is TWO checks, deliberately: the
 * `owners_admins_view_subscription` RLS policy decides whether they may see the row at all, and an
 * explicit `memberships.role = 'owner'` guard below decides whether they may charge for it. They
 * used to be one check — the policy was keyed on `organizations.user_id`, so creator-only — until
 * D048 had to widen it for the dashboard's plan card. Reading a plan and changing it are different
 * questions.
 *
 * The subscription lookup previously ran with NO filter at all — `.select(...).single()`
 * relying on RLS to happen to return exactly one row. That threw for anyone owning two
 * organisations, and for a single-org user it charged whichever row RLS yielded rather than
 * one the caller chose.
 *
 * STATUS CODES: transport and lookup failures use real codes. The three business-rule
 * refusals (downgrade before expiry, same plan, shorter duration) deliberately stay 200 —
 * they are answers, not errors.
 */
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

  // ANON key + the caller's token, so every query runs under their RLS.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_ANON_KEY') || '',
    { global: { headers: { Authorization: authHeader } } }
  )

  // Authenticate BEFORE doing any work, rather than after the lookups as before.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return json({ success: false, message: 'Invalid token' }, 401)
  }

  let planId: unknown
  let orgId: unknown
  let returnUrl: unknown
  try {
    ;({ planId, orgId, returnUrl } = await req.json())
  } catch {
    return json({ success: false, error: 'Malformed JSON body' }, 400)
  }
  if (typeof planId !== 'string' || !planId) {
    return json({ success: false, error: 'planId is required' }, 400)
  }
  if (typeof orgId !== 'string' || !orgId) {
    return json({ success: false, error: 'orgId is required' }, 400)
  }

  // **Billing is OWNER-only, and this is now the check that says so.**
  //
  // It used to be implicit: the subscription SELECT below was gated by an RLS policy keyed on
  // `organizations.user_id`, so only the workspace's creator could reach a row and therefore only
  // they could start a checkout. That policy became a role test in decisions.md **D048** — it had
  // to, because it also decided who could READ the plan, and an invited admin saw `$0` MRR and no
  // plan card on the dashboard.
  //
  // Reading the plan and CHANGING it are different questions, so they now have different answers:
  // RLS admits owner and admin to the row, and this guard keeps the charge owner-only, matching the
  // PRD's roles table (Owner: "full access; billing"; Admin: projects, invites, invoices).
  //
  // Deployed BEFORE the widened policy is pushed, or there is a window in which any admin can
  // change the org's plan.
  const { data: membership } = await supabase
    .from('memberships')
    .select('role, organizations(slug)')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.role !== 'owner') {
    // 403, not 404: they may legitimately see this subscription, they just may not buy for it.
    return json(
      { success: false, error: 'Only the workspace owner can change billing' },
      403
    )
  }

  const orgSlug = (
    membership?.organizations as unknown as { slug: string } | null
  )?.slug

  // Where Stripe sends the customer afterwards.
  //
  // This used to be built solely from the Origin header, which only exists on a browser
  // call. The app now invokes this from a Server Component (D016 keeps writes server-side),
  // and a server-to-server request sends no Origin — so Stripe was being handed
  // "undefined/success?session_id=..." and would reject the session outright.
  //
  // `returnUrl` is caller-supplied and becomes a redirect target after payment, so it is
  // checked against the SAME allowlist as CORS. Without that it is an open redirect on the
  // far side of a completed charge. When ALLOWED_ORIGINS is unset the Origin header is the
  // only accepted source, which keeps local development working without opening a hole.
  const originHeader = req.headers.get('origin') ?? ''
  const requested =
    typeof returnUrl === 'string' && returnUrl ? returnUrl : originHeader

  // With an allowlist configured, the requested base must be on it — no exceptions.
  // With none (local development), accept what was asked for. **Set ALLOWED_ORIGINS in
  // production**: it is the only thing standing between this and an open redirect.
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

  // Being non-empty is not the same as being usable. A base with no scheme — `undefined`, or
  // a bare `localhost:3000` — sails past the check above and only fails once Stripe sees
  // `success_url: "undefined/billing/success?..."`, which comes back as
  //
  //   Invalid URL: An explicit scheme (such as https) must be provided
  //
  // caught below and reported as a 502. A 502 reads as "Stripe is having a bad day"; the
  // truth is that our own URL was malformed, which is a 400 and ours to fix. Note that
  // `new URL("localhost:3000")` PARSES — with protocol `localhost:` — so parsing alone is
  // not enough and the protocol has to be checked explicitly. See decisions.md **D026**.
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

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()

  if (planError) {
    console.error(planError.message)
    return json({ success: false, error: 'Could not load plan' }, 500)
  }
  if (!plan) {
    return json({ success: false, error: 'Plan not found' }, 404)
  }

  // A plan with no Stripe price cannot be checked out. Two rows are like this today:
  // `Free`, which is the default a workspace already has and is reached by cancelling
  // rather than paying; and the newly seeded Starter/Studio/Agency rows, whose six Stripe
  // prices have to be created in the dashboard before this endpoint can sell them.
  //
  // Without this check `line_items: [{ price: null }]` reaches Stripe and throws, which
  // used to surface as an opaque crash.
  if (!plan.price_id) {
    console.error(`Plan ${plan.id} (${plan.name}) has no price_id`)
    return json(
      {
        success: false,
        message: 'This plan is not available for purchase yet.',
      },
      409
    )
  }

  // Scoped to the org the caller named. RLS decides whether they may see it, so a missing
  // row means "no such subscription, or not yours" — indistinguishable on purpose.
  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select(
      'id, current_period_end, organizations(id, name), plans(name, duration_months, price_cents)'
    )
    .eq('org_id', orgId)
    .maybeSingle()

  if (subscriptionError) {
    console.error(subscriptionError.message)
    return json({ success: false, error: 'Could not load subscription' }, 500)
  }
  if (!subscription) {
    return json({ success: false, error: 'Subscription not found' }, 404)
  }

  const rawEndDate = subscription.current_period_end
  const currentPlan = subscription.plans as {
    name: string
    duration_months: number
    price_cents: number
  }
  const currentTier = PLAN_TIERS[currentPlan.name as keyof typeof PLAN_TIERS]
  const newTier = PLAN_TIERS[plan.name as keyof typeof PLAN_TIERS]
  const currentDuration = currentPlan.duration_months
  const newDuration = plan.duration_months

  const now = new Date()
  const subscriptionEndDate = rawEndDate ? new Date(rawEndDate) : null
  const isExpired = subscriptionEndDate ? subscriptionEndDate < now : true

  // ---- Business rules. These stay 200: they are answers, not failures. ----------------
  if (newTier < currentTier && !isExpired) {
    return json(
      {
        success: false,
        message:
          'You cannot downgrade until your current subscription expires.',
      },
      200
    )
  }

  if (newTier === currentTier) {
    if (newDuration === currentDuration) {
      return json(
        { success: false, message: 'You are already subscribed to this plan.' },
        200
      )
    }

    if (newDuration < currentDuration && !isExpired) {
      return json(
        {
          success: false,
          message:
            'You cannot reduce your subscription duration until it expires.',
        },
        200
      )
    }
  }

  try {
    const orgPrefix = orgSlug ? `/${orgSlug}` : ''
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: plan.price_id, quantity: 1 }],
      mode: 'subscription',
      customer_email: user.email, // Optional: prefills email
      success_url: `${base}${orgPrefix}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${orgPrefix}/billing/canceled`,
      // Crucial: links Stripe back to the DB rows. orgId is the value the caller asked
      // for and RLS approved, not whatever the embedded row happened to carry.
      metadata: { orgId, subId: subscription.id },
    })

    return json({ url: session.url }, 200)
  } catch (err) {
    console.error('Stripe checkout session failed:', (err as Error).message)
    return json({ success: false, error: 'Could not start checkout' }, 502)
  }
})
