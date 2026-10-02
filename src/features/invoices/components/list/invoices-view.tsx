'use client'

import type { ProjectInvoiceContext } from '@/features/projects/types/invoice'
import { useState } from 'react'
import { InvoicesHeader } from '../invoice-header'
import { InvoiceList } from './invoice-list'
import { InvoiceSummaryCards } from './invoice-summary-cards'
import type { InvoicesPageData } from './types'

export function InvoicesView({
  orgSlug,
  projects,
  data,
}: {
  orgSlug: string
  /** Real projects - the New invoice sheet keeps creating real invoices. */
  projects: ProjectInvoiceContext[]
  data: InvoicesPageData
}) {
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false)

  return (
    <div className="space-y-6">
      <InvoicesHeader
        orgSlug={orgSlug}
        projects={projects}
        isOpen={isNewInvoiceOpen}
        setIsOpen={setIsNewInvoiceOpen}
      />
      <InvoiceSummaryCards
        summary={data.summary}
        onBillNow={() => setIsNewInvoiceOpen(true)}
      />
      <InvoiceList
        invoices={data.invoices}
        clients={data.clients}
        today={data.today}
      />
    </div>
  )
}
