import 'server-only'

import type { BillingOverview } from './types'

/**
 * MOCK — returns fixed data until the Stripe-backed subscription read is wired up.
 * Keep the signature: the page already passes the org slug it will need.
 */
export async function getBillingOverview(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used once the real query lands
  _org: string
): Promise<BillingOverview> {
  return {
    plan: {
      name: 'Studio',
      status: 'active',
      cycle: 'monthly',
      price: 49,
      currency: 'USD',
      usedSeats: 4,
      totalSeats: 5,
      renewsAt: '2026-08-01',
      paymentMethod: { brand: 'Visa', last4: '4242' },
    },
    unlocks: [
      'Unlimited projects & clients',
      'AI weekly updates',
      'Client invoice payments',
    ],
    charges: [
      {
        id: 'ch_mock_2',
        date: '2026-07-01',
        description: 'Studio plan',
        amount: 49,
        currency: 'USD',
      },
      {
        id: 'ch_mock_1',
        date: '2026-06-01',
        description: 'Studio plan',
        amount: 49,
        currency: 'USD',
      },
    ],
  }
}
