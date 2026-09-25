export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled'

export type BillingCycle = 'monthly' | 'yearly'

export interface BillingPlan {
  name: string
  status: SubscriptionStatus
  cycle: BillingCycle
  /** Whole currency units, e.g. 49 for $49. */
  price: number
  currency: string
  usedSeats: number
  totalSeats: number
  /** ISO date (YYYY-MM-DD). */
  renewsAt: string | null
  paymentMethod: { brand: string; last4: string } | null
}

export interface BillingCharge {
  id: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  description: string
  amount: number
  currency: string
}

export interface BillingOverview {
  plan: BillingPlan
  unlocks: string[]
  charges: BillingCharge[]
}
