import { PaymentSuccessCard } from '@/components/billing/payment-success-card'
import { DashboardOverview } from '@/features/dashboard/components/overview/dashboard-overview'
import { getDashboardData } from '@/features/dashboard/data'
import { getAccount } from '@/lib/dal'
import { DashboardSkeleton } from '@/skeleton/dashboard'
import { PaymentSuccessLoader } from '@/skeleton/payment-success-card'
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

  return (
    <>
      <Suspense fallback={<PaymentSuccessLoader />}>
        <PaymentSuccessCard />
      </Suspense>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardStream org={org} />
      </Suspense>
    </>
  )
}

// Async component that fetches dashboard data
async function DashboardStream({ org }: { org: string }) {
  const dashboardData = await getDashboardData(org)
  return <DashboardOverview data={dashboardData} />
}
