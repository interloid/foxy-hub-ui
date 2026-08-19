import { PaymentSuccessCard } from '@/components/billing/payment-success-card'
import { AppShell } from '@/components/layout/app-shell'
import { getFooter, withInvoiceCount, WORKSPACE } from '@/config/nav'
import { TimeGreeting } from '@/features/dashboard/components/time-greetings'
import { PROFILE } from '@/features/profile/data'
import { getAccount, getDashboardMetrics, getWorkspace } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  const account = await getAccount(org)

  if (!account) redirect('/sign-in?error=session_expired')

  const [workspace, metrics] = await Promise.all([
    getWorkspace(org),
    getDashboardMetrics(org),
  ])

  const activeHref = `/${org}`

  return (
    <AppShell
      sections={withInvoiceCount(metrics?.unpaidInvoices, org)}
      activeHref={activeHref}
      workspace={{
        name: workspace?.name ?? WORKSPACE.name,
        org: org,
      }}
      account={{
        name: account.fullName ?? PROFILE.noName,
        email: account.email ?? '',
        role: account.role ?? '',
        initials: account.initials,
        org,
      }}
      breadcrumb="Home"
      footer={getFooter(org)}
    >
      <Suspense fallback={null}>
        <PaymentSuccessCard />
      </Suspense>
      <TimeGreeting userName={account?.fullName ?? account?.email ?? null} />
    </AppShell>
  )
}
