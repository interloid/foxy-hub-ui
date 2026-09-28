import Stripe from 'npm:stripe@14'

import { stripe } from './clients.ts'

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

export function mapSubscriptionStatus(
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

export const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null)

export const isoFromUnix = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null

/**
 * The event's invoice, re-read through the SDK.
 *
 * Webhook payloads are rendered at the ENDPOINT's API version, not the SDK's pinned
 * 2023-10-16. From 2025-03-31 an invoice no longer has top-level `subscription`,
 * `payment_intent` or `charge` (they moved under `parent` and `payments`), so on a newer
 * endpoint every subscription invoice looked like a client invoice and was skipped.
 * Retrieving it here always returns the 2023-10-16 shape this file is written against.
 */
export async function loadInvoice(
  event: Stripe.Event
): Promise<Stripe.Invoice> {
  const { id } = event.data.object as { id: string }
  return await stripe.invoices.retrieve(id)
}
