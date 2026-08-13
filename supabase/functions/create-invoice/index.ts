import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Aligned with create-checkout and stripe-webhook. This was stripe@11.1.0 / 2022-11-15
// while the webhook that interprets the resulting events was on 14 / 2023-10-16 — object
// shapes differ between API versions, so a field read could work on one path and be
// undefined on the other.
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
});

/**
 * Origin allowlist, comma separated:
 *   supabase secrets set ALLOWED_ORIGINS=https://app.example.com
 *
 * Falls back to `*` when unset so local development keeps working. Authentication here is
 * by Authorization header rather than cookie, so a wildcard is not itself a CSRF hole —
 * pinning the origin just removes a free layer of defence.
 */
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.length === 0 ? "*" : ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

/**
 * Creates a Stripe Checkout session for one invoice.
 *
 * SECURITY — this endpoint decides how much money changes hands, so it trusts the request
 * for exactly one thing: WHICH invoice. Everything else is read from the database.
 *
 * It previously accepted `{ email, amount, invoiceId, currency }` and passed `amount`
 * straight to Stripe with no authentication at all (`verify_jwt = false` and no header
 * check). Because `stripe-webhook` marks an invoice paid on the strength of
 * `metadata.invoice_id`, anyone who knew this URL could settle any invoice, for any
 * organisation, for any amount they chose. `verify_jwt` is now `true` in `config.toml`
 * and the amount is no longer an input.
 *
 * Authorisation is the `members_and_client_view_invoices` RLS policy, reached by scoping
 * the client to the caller's own token — if they cannot SELECT the invoice, they cannot
 * pay it. There is no second permission check here to drift out of step with the policy.
 */
serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  // ANON key + the caller's token: every query below runs under their RLS, as them.
  // Never the service-role key — that would bypass the policy doing the authorising.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Invalid token" }, 401);

  let invoiceId: unknown;
  try {
    ({ invoiceId } = await req.json());
  } catch {
    return json({ error: "Malformed JSON body" }, 400);
  }
  if (typeof invoiceId !== "string" || invoiceId.length === 0) {
    return json({ error: "invoiceId is required" }, 400);
  }

  // RLS decides visibility. A row coming back means the caller is the project's client or a
  // member of the owning org; no row means not-found and not-permitted are indistinguishable,
  // which is what we want — this must not confirm that someone else's invoice exists.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, amount, currency, status, invoice_number, description, projects(client_id)")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error("invoice lookup failed:", invoiceError.message);
    return json({ error: "Could not load invoice" }, 500);
  }
  if (!invoice) return json({ error: "Invoice not found" }, 404);

  // Only unpaid invoices are payable. This is also what makes double payment impossible:
  // once the webhook writes 'paid', a second session can never be created for this row.
  if (invoice.status !== "due" && invoice.status !== "overdue") {
    return json({ error: `Invoice is ${invoice.status} and cannot be paid` }, 409);
  }

  // `amount` is numeric in Postgres and arrives as a string or number; Stripe wants an
  // integer in the currency's minor unit. Round rather than truncate, and never let a
  // float product decide a charge.
  const minorUnits = Math.round(Number(invoice.amount) * 100);
  if (!Number.isFinite(minorUnits) || minorUnits <= 0) {
    return json({ error: "Invoice amount is not chargeable" }, 409);
  }

  // Prefill only when the payer is the project's own client. A staff member generating a
  // pay link would otherwise have their address prefilled onto the client's receipt.
  const clientId = (invoice.projects as { client_id: string | null } | null)?.client_id;
  const customerEmail = clientId === user.id ? user.email : undefined;

  try {
    const session = await stripe.checkout.sessions.create({
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: invoice.currency,
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              ...(invoice.description ? { description: invoice.description } : {}),
            },
            unit_amount: minorUnits,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      invoice_creation: { enabled: true },
      // The webhook reads this back to settle the row. It is safe as an identifier
      // precisely because the amount is no longer caller-supplied.
      metadata: { invoice_id: invoice.id },
      success_url: `${req.headers.get("origin")}/dashboard/invoices/${invoice.id}/success`,
      cancel_url: `${req.headers.get("origin")}/dashboard/invoices/${invoice.id}`,
    });

    return json({ url: session.url }, 200);
  } catch (error) {
    console.error("stripe session create failed:", (error as Error).message);
    return json({ error: "Could not start checkout" }, 502);
  }
});
