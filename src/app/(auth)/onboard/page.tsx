import { OnboardWizard } from '@/features/onboarding/components/onboard-wizard'
import { ONBOARD_ACCOUNT } from '@/features/onboarding/data'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create your workspace',
  description: ONBOARD_ACCOUNT.subtitle,
  alternates: { canonical: '/onboard' },
  robots: { index: false, follow: true },
}

export default function OnboardPage() {
  return <OnboardWizard />
}
