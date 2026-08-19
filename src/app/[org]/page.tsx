import { PaymentSuccessCard } from '@/components/billing/payment-success-card'
import { TimeGreeting } from '@/features/dashboard/components/time-greetings'
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

  return (
    <>
      <Suspense fallback={null}>
        <PaymentSuccessCard />
      </Suspense>
      <TimeGreeting userName={account?.fullName ?? account?.email ?? null} />
    </>
  )
}
