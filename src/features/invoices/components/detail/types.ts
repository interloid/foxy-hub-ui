import type { InvoiceKind, InvoiceListStatus } from '../list/types'

export type InvoiceHistoryKind =
  | 'drafted'
  | 'sent'
  | 'reminded'
  | 'overdue'
  | 'paid'
  /** Any other event logged against the invoice. */
  | 'event'

export interface InvoiceHistoryItem {
  id: string
  kind: InvoiceHistoryKind
  text: string
  /** ISO timestamp; null when the text already says when ("Reminded 4d ago"). */
  at: string | null
}

export interface InvoiceDetailLine {
  id: string
  description: string
  /** "HOURS", "RETAINER", "FIXED FEE" - the small caps under the description. */
  typeLabel: string
  /** Pre-formatted, e.g. "20h". */
  qty: string
  /** Pre-formatted, e.g. "$180/hr". */
  rate: string
  amount: number
}

export interface InvoiceDetail {
  id: string
  number: string
  status: InvoiceListStatus
  kind: InvoiceKind
  currency: string
  /** ISO dates. */
  issuedOn: string
  dueDate: string | null
  paidAt: string | null
  paymentTermsDays: number
  /** Rounding printed in the terms: "rounded up to the nearest 15 min". */
  roundingMinutes: number

  agency: {
    name: string
    /** Not stored yet (`organizations` has no address) - empty until it is. */
    addressLines: string[]
    /** Not stored yet - null until `organizations` has a billing email. */
    email: string | null
  }
  client: {
    name: string
    contactName: string | null
    contactEmail: string | null
  }
  project: {
    id: string
    name: string
    /** "Billed on approved hours", "Monthly retainer", "Fixed fee". */
    billingBasis: string
  }

  lines: InvoiceDetailLine[]
  subtotal: number
  /** Percent, e.g. 0 or 20. */
  taxRate: number
  taxAmount: number
  total: number

  /** Stripe-hosted invoice page, once issued. */
  invoiceUrl: string | null
  /** Newest first. */
  history: InvoiceHistoryItem[]
}
