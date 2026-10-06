import type { BillingPaymentStatus } from '../types'

/** How each payment status reads on the billing page, and its colour. */
export const PAYMENT_STATUS: Record<
  BillingPaymentStatus,
  { label: string; tone: 'muted' | 'success' | 'warning' | 'destructive' }
> = {
  pending: { label: 'Pending', tone: 'muted' },
  requires_action: { label: 'Action needed', tone: 'warning' },
  paid: { label: 'Paid', tone: 'muted' },
  failed: { label: 'Failed', tone: 'destructive' },
  refunded: { label: 'Refunded', tone: 'muted' },
  partially_refunded: { label: 'Part refunded', tone: 'muted' },
  disputed: { label: 'Disputed', tone: 'warning' },
  dispute_lost: { label: 'Dispute lost', tone: 'destructive' },
  void: { label: 'Void', tone: 'muted' },
}

export const PAYMENT_TONE_CLASS = {
  muted: 'text-subtle-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
} as const
