import { OnboardCompleteClient } from '@/features/onboarding/components/onboard-complete-client'
import { verifySession } from '@/lib/dal'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Finishing setup',
  robots: { index: false, follow: false },
}

export default async function OnboardCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; cycle?: string }>
}) {
  const params = await searchParams

  const session = await verifySession()
  if (!session) redirect('/sign-in?error=session_expired')

  const planName = params.plan?.trim()
  if (!planName) redirect('/')

  const cycle = params.cycle === 'yearly' ? 'yearly' : 'monthly'

  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-6">
      <OnboardCompleteClient planName={planName} cycle={cycle} />
    </div>
  )
}
