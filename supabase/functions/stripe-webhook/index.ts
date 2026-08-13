import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

/**
 * Stripe's subscription status vocabulary -> `public.subscription_status`.
 *
 * Stripe spells it `canceled`; the enum uses `cancelled`. That one difference is
 * translated here rather than renaming the enum value, which existing rows depend on.
 * Every other status maps to itself — the four Stripe states the enum used to lack were
 * added in `20260807140000_subscription_status_stripe_values.sql`.
 *
 * Writing `subscription.status` raw was throwing invalid_text_representation inside the
 * try block below, returning 500, and leaving Stripe to retry the event indefinitely.
 */
const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "cancelled",
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  unpaid: "unpaid",
  paused: "paused",
};

/** Returns null for anything unrecognised, so the caller omits the column rather than
 *  writing a value the enum will reject. */
function mapSubscriptionStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const mapped = SUBSCRIPTION_STATUS[status];
  if (!mapped) {
    console.error(`Unrecognised Stripe subscription status: ${status}`);
    return null;
  }
  return mapped;
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      stripe.webhooks.subtleCrypto,
    );
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Prevent duplicate processing — CLAIM the event before handling it, and let the
  // `stripe_events.event_id` unique constraint be the lock.
  //
  // This used to SELECT first and INSERT at the very end. Two problems: Stripe retries
  // aggressively and can deliver concurrently, so two copies could both pass the "seen it?"
  // check before either wrote the row — applying one payment twice; and if the handler
  // succeeded but the trailing insert failed, the event stayed replayable forever.
  //
  // Inserting first collapses check-and-claim into one atomic operation. 23505 is
  // unique_violation, which here means another delivery already owns this event.
  const { error: claimError } = await supabase.from("stripe_events").insert({
    event_id: event.id,
    type: event.type,
    processed_at: new Date().toISOString(),
  });

  if (claimError) {
    if (claimError.code === "23505") {
      return new Response("Event already processed", { status: 200 });
    }
    console.error("Could not claim event:", claimError.message);
    return new Response("Could not claim event", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const invoice = await stripe.invoices.retrieve(session.invoice as string);
        // Identifiers only. Logging the whole `session` and `invoice` objects put the
        // customer's email, billing address and payment-method details into the function
        // logs, where they are retained and readable by anyone with dashboard access.
        console.log(`checkout.session.completed ${session.id} mode=${session.mode}`);
        if (session.mode === "payment") {
          const invoiceId = session.metadata?.invoice_id; // The ID we set in create-invoice

          if (invoiceId) {
            // Update your invoice record to 'paid'. `select()` so the feed row below can name the
            // invoice and its amount without a second read.
            const { data: paidInvoice } = await supabase
              .from("invoices")
              .update({
                status: "paid",
                payment_intent: session.payment_intent,
                paid_at: new Date().toISOString(),
                invoice_url: invoice.hosted_invoice_url,
              })
              .eq("id", invoiceId)
              .select("org_id, project_id, invoice_number, amount, currency")
              .maybeSingle();

            console.log(`Invoice ${invoiceId} marked as paid.`);

            // The dashboard's Recent activity row. The prototype's own example line for this event
            // is "Invoice INV-014 was paid — $8,400", so the wording is the design's.
            //
            // **`actor_kind: 'system'` with a null actor** — nobody in the workspace did this, a
            // webhook did, which is exactly the case `activity_events.actor_id` is nullable for.
            // This runs under service_role (BYPASSRLS), the only path allowed to write a null
            // actor: `members_insert_activity_events` pins `actor_id` to `auth.uid()`. See D047.
            //
            // Failure is swallowed the same way `lib/activity.ts` swallows it: the invoice IS
            // paid, and Stripe must get its 200 regardless. A missing feed line is not worth a
            // retried webhook.
            if (paidInvoice?.org_id) {
              const amount = Number(paidInvoice.amount);
              const money = Number.isFinite(amount)
                ? new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: (paidInvoice.currency as string) || "USD",
                    maximumFractionDigits: 0,
                  }).format(amount)
                : null;

              const { error: feedError } = await supabase.from("activity_events").insert({
                org_id: paidInvoice.org_id,
                actor_id: null,
                actor_kind: "system",
                type: "invoice_paid",
                summary: `Invoice ${paidInvoice.invoice_number} was paid${money ? ` — ${money}` : ""}`,
                project_id: paidInvoice.project_id,
                entity_type: "invoice",
                entity_id: invoiceId,
                payload: { invoice_number: paidInvoice.invoice_number, amount: paidInvoice.amount },
              });

              if (feedError) {
                console.error("activity_events insert failed (invoice_paid):", feedError.message);
              }
            }
          }
          break;
        }
        if (session.mode === "subscription") {
          const subscriptionId = session.subscription;

          if (!subscriptionId) {
            console.warn("No subscription found in checkout session");
            break;
          }

          // 1. Fetch full subscription to get the Stripe Price ID
          const subData = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["latest_invoice.payment_intent"],
          });
          const invoice = subData.latest_invoice as Stripe.Invoice;

          const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent | null;

          const stripePriceId = subData.items?.data?.[0]?.price?.id;

          // 2. Validate: Find the internal plan UUID using the Stripe Price ID
          const { data: plan, error: planError } = await supabase
            .from("plans")
            .select("id")
            .eq("price_id", stripePriceId) // Assumes you have this column
            // maybeSingle: an unrecognised price id is an expected outcome, handled just
            // below. .single() raises PGRST116 on zero rows and logged a spurious error.
            .maybeSingle();

          if (planError || !plan) {
            console.error(
              `Invalid Plan: Could not find internal plan for Price ID: ${stripePriceId}`,
            );
            break; // Stop here if the plan isn't valid
          }

          let paymentMethodType: string | null = null;
          let paymentMethodDetails = {};
          let paymentIntentId: string | null = null;

          if (paymentIntent) {
            paymentIntentId = paymentIntent.id;

            const pi = await stripe.paymentIntents.retrieve(paymentIntent.id, {
              expand: ["latest_charge"],
            });

            const charge = pi.latest_charge as Stripe.Charge;

            paymentMethodType = charge.payment_method_details?.type ?? null;

            switch (paymentMethodType) {
              case "card":
                paymentMethodDetails = charge.payment_method_details?.card ?? {};
                break;

              case "us_bank_account":
                paymentMethodDetails = charge.payment_method_details?.us_bank_account ?? {};
                break;

              case "klarna":
                paymentMethodDetails = charge.payment_method_details?.klarna ?? {};
                break;

              case "affirm":
                paymentMethodDetails = charge.payment_method_details?.affirm ?? {};
                break;

              default:
                paymentMethodDetails = charge.payment_method_details ?? {};
            }
          }
          const orgId = session.metadata?.orgId;
          const subId = session.metadata?.subId;
          if (orgId) {
            const sub = await supabase
              .from("subscriptions")
              .update({
                stripe_customer_id: session.customer,
                stripe_subscription_id: subscriptionId,
                stripe_payment_intent: paymentIntentId,
                payment_method_type: paymentMethodType,
                payment_method_details: paymentMethodDetails,
                org_id: orgId,
                ...(mapSubscriptionStatus(subData.status)
                  ? { status: mapSubscriptionStatus(subData.status) as string }
                  : {}),
                plan_id: plan.id, // Using the validated internal UUID
                current_period_end: subData.current_period_end
                  ? new Date(subData.current_period_end * 1000).toISOString()
                  : null,
              })
              .eq("id", subId)
              .select();
            console.log("Subscription created/updated with validated plan", sub);
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        let sub = event.data.object;

        if (!sub.current_period_end || !sub.items) {
          sub = await stripe.subscriptions.retrieve(sub.id);
        }

        const stripePriceId = sub.items?.data?.[0]?.price?.id;

        // OPTIONAL VALIDATION:
        // Check if this price ID exists in your 'plans' table
        const { data: planExists } = await supabase
          .from("plans")
          .select("id")
          .eq("price_id", stripePriceId) // Assuming you store the stripe ID here
          .maybeSingle();

        // If you require the plan to exist, you can throw an error or handle it
        if (!planExists) {
          console.warn(`Plan not found in database for Price ID: ${stripePriceId}`);
        }

        // UPDATE, not upsert. The upsert had no `org_id`, which is NOT NULL — so whenever
        // no row matched the customer (Stripe does not guarantee event ordering, so an
        // update can arrive before checkout.session.completed has stamped the customer id)
        // it took the INSERT branch and violated the constraint.
        //
        // `plan_id` is only written when a plan actually resolved. The previous
        // `planExists?.id || null` wiped the org's plan association whenever the price id
        // was unknown — including on cancellation, where the plan is still the record of
        // what they had.
        const mappedStatus = mapSubscriptionStatus(sub.status);
        const { data, error: subUpdateError } = await supabase
          .from("subscriptions")
          .update({
            ...(mappedStatus ? { status: mappedStatus } : {}),
            ...(planExists ? { plan_id: planExists.id } : {}),
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("stripe_customer_id", sub.customer)
          .select();

        if (subUpdateError) {
          console.error("Subscription update failed:", subUpdateError.message);
        } else if (!data || data.length === 0) {
          console.warn(`No subscription row for Stripe customer ${sub.customer}; nothing updated`);
        }
        break;
      }
    }

    // The event was already recorded when it was claimed, above.
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error("HANDLER ERROR:", err);

    // Release the claim. Claiming up front is what makes concurrent deliveries safe, but
    // it also means a row exists before the work has succeeded — so without this, a
    // transient failure (Stripe API blip, database hiccup) would leave the event marked
    // processed and every retry would short-circuit on 'already processed'. The event
    // would be silently lost. Deleting the row hands it back to Stripe's retry schedule.
    const { error: releaseError } = await supabase
      .from("stripe_events")
      .delete()
      .eq("event_id", event.id);

    if (releaseError) {
      console.error(
        `Could not release claim on ${event.id} — it will NOT be retried:`,
        releaseError.message,
      );
    }

    return new Response(`Handler Error: ${err.message}`, { status: 500 });
  }
});
