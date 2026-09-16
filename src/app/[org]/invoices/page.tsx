import { InvoicesHeader } from '@/features/invoices/components/invoice-header'
import { InvoiceMetricsCards } from '@/features/invoices/components/invoice-metrics'
import { InvoicesTable } from '@/features/invoices/components/invoices-table'
import { getInvoiceMetrics } from '@/features/invoices/queries/get-invoice-metrics'
import { getInvoices } from '@/features/invoices/queries/get-invoices'
import { getProjectsForInvoicing } from '@/features/projects/queries'
import { getWorkspace } from '@/lib/dal'
import { notFound } from 'next/navigation'

interface InvoicePageProps {
  params: Promise<{
    org: string
  }>
  searchParams: Promise<{
    page?: string
  }>
}

export default async function InvoicePage({
  params,
  searchParams,
}: InvoicePageProps) {
  const { org } = await params
  const resolvedSearchParams = await searchParams

  const workspace = await getWorkspace(org)
  if (!workspace) {
    notFound()
  }

  const currentPage = Math.max(
    1,
    parseInt(resolvedSearchParams.page || '1', 10) || 1
  )
  const pageSize = 10

  // Fetch projects, metrics, and paginated invoices concurrently
  const [projects, metrics, invoicesData] = await Promise.all([
    getProjectsForInvoicing(org),
    getInvoiceMetrics(workspace.id),
    getInvoices(workspace.id, currentPage, pageSize),
  ])

  return (
    <div className="ds:p-6 space-y-6">
      <InvoicesHeader orgSlug={org} projects={projects} />
      <InvoiceMetricsCards metrics={metrics} />
      <InvoicesTable
        invoices={invoicesData.invoices}
        totalCount={invoicesData.totalCount}
        totalPages={invoicesData.totalPages}
        currentPage={invoicesData.currentPage}
      />
    </div>
  )
}
