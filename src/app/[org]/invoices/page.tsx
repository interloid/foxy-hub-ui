import { InvoicePaidBanner } from '@/features/invoices/components/invoice-paid-banner'
import { InvoicesView } from '@/features/invoices/components/list/invoices-view'
import {
  getInvoiceMetrics,
  readyToBillFromDrafts,
} from '@/features/invoices/queries/get-invoice-metrics'
import { getInvoiceRows } from '@/features/invoices/queries/get-invoices'
import { getProjectsForInvoicing } from '@/features/projects/queries'
import { getWorkspace } from '@/lib/dal'
import { notFound } from 'next/navigation'

interface InvoicePageProps {
  params: Promise<{
    org: string
  }>
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { org } = await params

  const workspace = await getWorkspace(org)
  if (!workspace) {
    notFound()
  }

  // The drafts double as the Ready to bill figure, so the card and the New invoice sheet
  // always agree.
  const [projects, metrics, rows] = await Promise.all([
    getProjectsForInvoicing(org),
    getInvoiceMetrics(workspace.id),
    getInvoiceRows(workspace.id),
  ])

  return (
    <div className="ds:p-6 space-y-6">
      <InvoicePaidBanner />
      <InvoicesView
        orgSlug={org}
        projects={projects}
        data={{
          summary: { ...metrics, ...readyToBillFromDrafts(projects) },
          invoices: rows.invoices,
          clients: rows.clients,
          today: rows.today,
        }}
      />
    </div>
  )
}
