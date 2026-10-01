import { OnboardWizard } from '@/features/onboarding/components/onboard-wizard'
import { ONBOARD_ACCOUNT } from '@/features/onboarding/data'
import { getPlanSeats } from '@/features/onboarding/queries'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create your workspace',
  description: ONBOARD_ACCOUNT.subtitle,
  alternates: { canonical: '/onboard' },
  robots: { index: false, follow: true },
}

export default async function OnboardPage() {
  const planSeats = await getPlanSeats()
  return <OnboardWizard planSeats={planSeats} />
}
