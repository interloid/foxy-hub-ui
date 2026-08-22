import { PaymentSuccessCard } from '@/components/billing/payment-success-card'
import { DashboardOverview } from '@/features/dashboard/components/dashboard-overview'
import { getDashboardData } from '@/features/dashboard/data'
import { getAccount } from '@/lib/dal'
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
  const dashboardData = await getDashboardData(org)
  return (
    <>
      <Suspense fallback={null}>
        <PaymentSuccessCard />
      </Suspense>
      <DashboardOverview data={dashboardData} />
      {/* <TimeGreeting
        userName={account?.fullName ?? account?.email?.split('@')[0] ?? null}
      /> */}
    </>
  )
}
