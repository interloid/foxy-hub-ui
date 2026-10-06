import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { InvoiceActionsBar } from './invoice-actions-bar'
import { InvoiceDocument } from './invoice-document'
import { InvoiceHistoryCard } from './invoice-history-card'
import { InvoiceSummaryCard } from './invoice-summary-card'
import { SimulateClientCard } from './simulate-client-card'
import type { InvoiceDetail } from './types'

interface InvoiceDetailViewProps {
  invoice: InvoiceDetail
  orgSlug: string
  /** ISO date in the user's zone - what "10d overdue" is counted from. */
  today: string
}

export function InvoiceDetailView({
  invoice,
  orgSlug,
  today,
}: InvoiceDetailViewProps) {
  return (
    <div className="space-y-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-[13px]"
      >
        <Link
          href={`/${orgSlug}/invoices`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Invoices
        </Link>
        <span className="text-muted-foreground" aria-hidden="true">
          /
        </span>
        <span
          className="text-foreground font-mono font-bold"
          aria-current="page"
        >
          {invoice.number}
        </span>
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <section className="bg-card border-border overflow-hidden rounded-xl border shadow-xs">
          <InvoiceSummaryCard
            invoice={invoice}
            orgSlug={orgSlug}
            today={today}
          />

          <div className="bg-muted/50 border-border space-y-4 border-t px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                Client copy - preview
              </p>
              <p className="text-muted-foreground text-[11.5px]">
                Exactly what Download PDF produces
              </p>
            </div>
            <InvoiceDocument invoice={invoice} />
            {invoice.taxRate === 0 && (
              <p className="text-muted-foreground text-[11.5px]">
                Tax is zero-rated until you add VAT details in Settings →
                Billing.
              </p>
            )}
          </div>

          <InvoiceActionsBar invoice={invoice} />
        </section>

        <aside className="space-y-5">
          <InvoiceHistoryCard history={invoice.history} />
          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <SimulateClientCard invoice={invoice} />
          )}
        </aside>
      </div>
    </div>
  )
}
