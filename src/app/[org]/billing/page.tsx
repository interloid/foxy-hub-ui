import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BillingView } from '@/features/billing/components/billing-view'
import { getBillingOverview } from '@/features/billing/queries'
import { getWorkspace } from '@/lib/dal'
import { isBillingRole } from '@/lib/role'

interface BillingPageProps {
  params: Promise<{ org: string }>
}

export async function generateMetadata({
  params,
}: BillingPageProps): Promise<Metadata> {
  const { org } = await params

  return {
    title: 'Billing & plan | Foxy Hub',
    description: `Subscription and billing for ${org}`,
  }
}

export default async function BillingPage({ params }: BillingPageProps) {
  const { org } = await params

  // Billing is admin-only (`11_rls_subscriptions` excludes manager). 404 rather than
  // "denied", so the page does not confirm it exists.
  const workspace = await getWorkspace(org)
  if (!workspace || !isBillingRole(workspace.role)) notFound()

  const data = await getBillingOverview(org)

  return <BillingView data={data} />
}
