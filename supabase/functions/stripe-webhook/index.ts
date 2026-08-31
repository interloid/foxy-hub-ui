import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'cancelled',
  incomplete: 'incomplete',
  incomplete_expired: 'incomplete_expired',
  unpaid: 'unpaid',
  paused: 'paused',
}

function mapSubscriptionStatus(
  status: string | null | undefined
): string | null {
  if (!status) return null
  const mapped = SUBSCRIPTION_STATUS[status]
  if (!mapped) {
    console.error(`Unrecognised Stripe subscription status: ${status}`)
    return null
  }
  return mapped
}

/**
 * Server-side helper to record pending invitations into `invitations`, send emails, and clear user metadata
 */
async function redeemPendingInvites(
  supabaseClient: SupabaseClient,
  orgId: string,
  userId: string,
  invites: Array<{ email: string; role?: string }>
) {
  const siteUrl = Deno.env.get('SITE_URL') || ''

  for (const invite of invites) {
    if (!invite.email) continue

    const email = invite.email.trim().toLowerCase()
    const role = (invite.role || 'member').toLowerCase()

    const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`

    // Hash token using Web Crypto API
    const encoder = new TextEncoder()
    const data = encoder.encode(rawToken)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const tokenHash = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // 1. Insert/Upsert invitation record into `invitations` table
    const { data: row, error: inviteError } = await supabaseClient
      .from('invitations')
      .upsert(
        {
          org_id: orgId,
          email: email,
          role: role,
          token_hash: tokenHash,
          invited_by: userId || null,
        },
        { onConflict: 'org_id,email' }
      )
      .select('id')
      .single()

    if (inviteError || !row) {
      console.error(
        `Failed to create invitation for ${email}:`,
        inviteError?.message
      )
      throw new Error(`Invitation insertion failed: ${inviteError?.message}`)
    }

    // 2. Dispatch invitation email via Supabase Auth Admin API
    const { error: mailError } =
      await supabaseClient.auth.admin.inviteUserByEmail(email, {
        data: { invite_token: rawToken, org_id: orgId },
        redirectTo: `${siteUrl}/set-password`,
      })

    if (mailError) {
      console.error(
        `Failed to dispatch invite email to ${email}:`,
        mailError.message
      )
      // Roll back invitation row if mail dispatch fails
      await supabaseClient.from('invitations').delete().eq('id', row.id)
      throw new Error(`Invitation email dispatch failed: ${mailError.message}`)
    }
  }

  // 3. Clear pending_invitations from user_metadata
  if (userId) {
    const { error: userUpdateError } =
      await supabaseClient.auth.admin.updateUserById(userId, {
        user_metadata: { pending_invitations: [] },
      })

    if (userUpdateError) {
      console.warn(
        `Failed to clear pending_invitations for user ${userId}:`,
        userUpdateError.message
      )
    }
  }
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      stripe.webhooks.subtleCrypto
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 })
  }

  const { error: claimError } = await supabase.from('stripe_events').insert({
    event_id: event.id,
    type: event.type,
    processed_at: new Date().toISOString(),
  })

  if (claimError) {
    if (claimError.code === '23505') {
      return new Response('Event already processed', { status: 200 })
    }
    console.error('Could not claim event:', claimError.message)
    return new Response('Could not claim event', { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log(
          `checkout.session.completed ${session.id} mode=${session.mode}`
        )

        // Process pending invitations from checkout metadata if present
        const orgIdFromMeta =
          session.metadata?.org_id || session.metadata?.orgId
        const userIdFromMeta =
          session.metadata?.user_id || session.metadata?.userId
        const rawPendingInvites = session.metadata?.pending_invitations

        if (orgIdFromMeta && rawPendingInvites) {
          try {
            const parsedInvites = JSON.parse(rawPendingInvites)
            if (Array.isArray(parsedInvites) && parsedInvites.length > 0) {
              await redeemPendingInvites(
                supabase,
                orgIdFromMeta,
                userIdFromMeta || '',
                parsedInvites
              )
              console.log(
                `Successfully processed ${parsedInvites.length} pending invitations for org ${orgIdFromMeta}`
              )
            }
          } catch (invErr) {
            const invErrMessage =
              invErr instanceof Error ? invErr.message : String(invErr)
            console.error(
              'Error processing pending_invitations:',
              invErrMessage
            )
            throw invErr // Re-throw so handler catch block triggers Stripe retry logic
          }
        }

        if (session.mode === 'payment') {
          let hostedInvoiceUrl: string | null = null
          if (session.invoice) {
            const invoice = await stripe.invoices.retrieve(
              session.invoice as string
            )
            hostedInvoiceUrl = invoice.hosted_invoice_url ?? null
          }

          const invoiceId = session.metadata?.invoice_id

          if (invoiceId) {
            const { data: paidInvoice } = await supabase
              .from('invoices')
              .update({
                status: 'paid',
                payment_intent: session.payment_intent as string,
                paid_at: new Date().toISOString(),
                invoice_url: hostedInvoiceUrl,
              })
              .eq('id', invoiceId)
              .select('org_id, project_id, invoice_number, amount, currency')
              .maybeSingle()

            console.log(`Invoice ${invoiceId} marked as paid.`)

            if (paidInvoice?.org_id) {
              const amount = Number(paidInvoice.amount)
              const money = Number.isFinite(amount)
                ? new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: (paidInvoice.currency as string) || 'USD',
                    maximumFractionDigits: 0,
                  }).format(amount)
                : null

              const { error: feedError } = await supabase
                .from('activity_events')
                .insert({
                  org_id: paidInvoice.org_id,
                  actor_id: null,
                  actor_kind: 'system',
                  type: 'invoice_paid',
                  summary: `Invoice ${paidInvoice.invoice_number} was paid${money ? ` — ${money}` : ''}`,
                  project_id: paidInvoice.project_id,
                  entity_type: 'invoice',
                  entity_id: invoiceId,
                  payload: {
                    invoice_number: paidInvoice.invoice_number,
                    amount: paidInvoice.amount,
                  },
                })

              if (feedError) {
                console.error(
                  'activity_events insert failed (invoice_paid):',
                  feedError.message
                )
              }
            }
          }
          break
        }

        if (session.mode === 'subscription') {
          const subscriptionId = session.subscription

          if (!subscriptionId) {
            console.warn('No subscription found in checkout session')
            break
          }

          const subData = await stripe.subscriptions.retrieve(
            subscriptionId as string,
            {
              expand: ['latest_invoice.payment_intent'],
            }
          )
          const invoice = subData.latest_invoice as Stripe.Invoice
          const paymentIntent =
            invoice.payment_intent as Stripe.PaymentIntent | null
          const stripePriceId = subData.items?.data?.[0]?.price?.id

          const { data: plan, error: planError } = await supabase
            .from('plans')
            .select('id')
            .eq('price_id', stripePriceId)
            .maybeSingle()

          if (planError || !plan) {
            console.error(
              `Invalid Plan: Could not find internal plan for Price ID: ${stripePriceId}`
            )
            break
          }

          let paymentMethodType: string | null = null
          let paymentMethodDetails = {}
          let paymentIntentId: string | null = null

          if (paymentIntent) {
            paymentIntentId = paymentIntent.id

            const pi = await stripe.paymentIntents.retrieve(paymentIntent.id, {
              expand: ['latest_charge'],
            })

            const charge = pi.latest_charge as Stripe.Charge
            paymentMethodType = charge.payment_method_details?.type ?? null

            switch (paymentMethodType) {
              case 'card':
                paymentMethodDetails = charge.payment_method_details?.card ?? {}
                break
              case 'us_bank_account':
                paymentMethodDetails =
                  charge.payment_method_details?.us_bank_account ?? {}
                break
              case 'klarna':
                paymentMethodDetails =
                  charge.payment_method_details?.klarna ?? {}
                break
              case 'affirm':
                paymentMethodDetails =
                  charge.payment_method_details?.affirm ?? {}
                break
              default:
                paymentMethodDetails = charge.payment_method_details ?? {}
            }
          }

          const orgId = session.metadata?.orgId || session.metadata?.org_id
          const subId = session.metadata?.subId || session.metadata?.sub_id

          if (!orgId || !subId) {
            throw new Error(
              `Missing metadata in checkout session (orgId: ${orgId}, subId: ${subId})`
            )
          }

          const { data: updatedSubs, error: updateError } = await supabase
            .from('subscriptions')
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscriptionId as string,
              stripe_payment_intent: paymentIntentId,
              payment_method_type: paymentMethodType,
              payment_method_details: paymentMethodDetails,
              org_id: orgId,
              ...(mapSubscriptionStatus(subData.status)
                ? { status: mapSubscriptionStatus(subData.status) as string }
                : {}),
              plan_id: plan.id,
              current_period_end: subData.current_period_end
                ? new Date(subData.current_period_end * 1000).toISOString()
                : null,
            })
            .eq('id', subId)
            .select()

          if (updateError) {
            throw new Error(
              `Failed to update subscription ${subId}: ${updateError.message}`
            )
          }

          if (!updatedSubs || updatedSubs.length === 0) {
            throw new Error(`Subscription row not found for id: ${subId}`)
          }

          console.log('Subscription updated successfully:', updatedSubs[0])
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        let sub = event.data.object as Stripe.Subscription

        if (!sub.current_period_end || !sub.items) {
          sub = await stripe.subscriptions.retrieve(sub.id)
        }

        const stripePriceId = sub.items?.data?.[0]?.price?.id

        const { data: planExists } = await supabase
          .from('plans')
          .select('id')
          .eq('price_id', stripePriceId)
          .maybeSingle()

        if (!planExists) {
          console.warn(
            `Plan not found in database for Price ID: ${stripePriceId}`
          )
        }

        const mappedStatus = mapSubscriptionStatus(sub.status)
        const { data, error: subUpdateError } = await supabase
          .from('subscriptions')
          .update({
            ...(mappedStatus ? { status: mappedStatus } : {}),
            ...(planExists ? { plan_id: planExists.id } : {}),
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('stripe_customer_id', sub.customer as string)
          .select()

        if (subUpdateError) {
          console.error('Subscription update failed:', subUpdateError.message)
        } else if (!data || data.length === 0) {
          console.warn(
            `No subscription row for Stripe customer ${sub.customer}; nothing updated`
          )
        }
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err)
    console.error('HANDLER ERROR:', err)

    const { error: releaseError } = await supabase
      .from('stripe_events')
      .delete()
      .eq('event_id', event.id)

    if (releaseError) {
      console.error(
        `Could not release claim on ${event.id} — it will NOT be retried:`,
        releaseError.message
      )
    }

    return new Response(`Handler Error: ${errMessage}`, { status: 500 })
  }
})
