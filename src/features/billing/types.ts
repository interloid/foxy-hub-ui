export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled'

export type BillingCycle = 'monthly' | 'yearly'

export interface UpcomingPlanChange {
  planId: string
  planName: string
  cycle: BillingCycle
  effectiveAt: string
}

export interface BillingPlan {
  planId: string
  name: string
  status: SubscriptionStatus
  cycle: BillingCycle
  price: number
  currency: string
  usedSeats: number
  totalSeats: number
  periodStart: string | null
  renewsAt: string | null
  paymentMethod: {
    brand: string
    last4: string
    expMonth: number | null
    expYear: number | null
  } | null
  upcoming: UpcomingPlanChange | null

  cancelsAt: string | null
}

export type BillingPaymentStatus =
  | 'pending'
  | 'requires_action'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'dispute_lost'
  | 'void'

export interface BillingCharge {
  id: string
  date: string
  description: string
  amount: number
  refunded: number
  currency: string
  status: BillingPaymentStatus
  invoiceUrl: string | null
  invoiceNumber: string | null
}

/** The latest payment went wrong - shown as a warning above the plan card. */
export interface BillingPaymentIssue {
  status: 'failed' | 'requires_action'
  amount: number
  currency: string
  message: string | null
  nextAttemptAt: string | null
  invoiceUrl: string | null
}

/** One plan in the Change plan dialog. Prices in whole currency units. */
export interface PlanOption {
  id: string
  rank: number
  name: string
  description: string
  seats: number
  monthlyPrice: number
  yearlyPrice: number
}

export interface BillingOverview {
  plan: BillingPlan
  plans: PlanOption[]
  unlocks: string[]
  charges: BillingCharge[]
  paymentIssue: BillingPaymentIssue | null
  credit: { amount: number; currency: string } | null
}
