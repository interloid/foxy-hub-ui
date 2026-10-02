/** How the invoice was billed - shown under the invoice number. */
export type InvoiceKind = 'hours' | 'retainer' | 'fixed'

/**
 * `sent` is the database's `due` while its due date hasn't passed; a `due` invoice past its
 * date shows as `overdue` even before the nightly job flips the stored status.
 */
export type InvoiceListStatus =
  'draft' | 'sent' | 'overdue' | 'paid' | 'cancelled'

export interface InvoiceRow {
  id: string
  number: string
  kind: InvoiceKind
  projectName: string
  clientId: string | null
  clientName: string
  amount: number
  status: InvoiceListStatus
  /** ISO date. */
  dueDate: string | null
  /** ISO date - set once paid. */
  paidAt: string | null
  /** Stripe-hosted invoice page, once the invoice has been issued. */
  invoiceUrl: string | null
}

export interface InvoiceSummary {
  paidThisMonth: number
  /** Paid invoices, ever. */
  settledCount: number
  outstanding: number
  outstandingCount: number
  overdue: number
  overdueCount: number
  /** Approved, unbilled hours across projects, priced. */
  readyToBill: number
  readyToBillProjects: number
  /** What fixed / budget contracts can still be invoiced. */
  leftToDraw: number
  leftToDrawContracts: number
}

export interface InvoiceClientOption {
  id: string
  name: string
}

export interface InvoicesPageData {
  summary: InvoiceSummary
  invoices: InvoiceRow[]
  clients: InvoiceClientOption[]
  /** ISO date in the user's zone - what "10d overdue" and "in 9d" are counted from. */
  today: string
}
