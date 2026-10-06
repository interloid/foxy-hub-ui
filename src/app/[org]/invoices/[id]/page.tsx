import { InvoiceDetailView } from '@/features/invoices/components/detail/invoice-detail-view'
import { getInvoiceDetail } from '@/features/invoices/queries/get-invoice-detail'
import { getUserTimeZone, getWorkspace } from '@/lib/dal'
import { todayIn } from '@/lib/date'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

interface InvoiceDetailPageProps {
  params: Promise<{
    org: string
    id: string
  }>
}

export const metadata: Metadata = {
  title: 'Invoice | Foxy Hub',
}

export default async function InvoiceDetailPage({
  params,
}: InvoiceDetailPageProps) {
  const { org, id } = await params

  const workspace = await getWorkspace(org)
  if (!workspace) notFound()

  const today = todayIn(await getUserTimeZone())
  const invoice = await getInvoiceDetail(workspace.id, id, today)
  if (!invoice) notFound()

  return (
    <div className="ds:p-6">
      <InvoiceDetailView invoice={invoice} orgSlug={org} today={today} />
    </div>
  )
}
