import { AuthLayout } from '@/components/layout/auth-layout'
import { AuthHeroPanel } from '@/components/shared/app/auth-hero-panel'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { AUTH_CARD_TAGLINE, AUTH_HERO, SIGN_IN } from '@/features/auth/data'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in',
  description: SIGN_IN.subtitle,
  alternates: { canonical: '/sign-in' },
  robots: { index: false, follow: true },
}

const ERRORS: Record<string, string> = {
  invalid_link: 'That sign-in link has expired or was already used.',
  session_expired: 'Your session expired. Sign in again.',
  missing_code: 'That sign-in link has expired or was already used.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <AuthLayout
      brand={SIGN_IN.brand}
      tagline={AUTH_CARD_TAGLINE}
      hero={
        <AuthHeroPanel
          image={AUTH_HERO.image}
          eyebrow={AUTH_HERO.eyebrow}
          headline={AUTH_HERO.headline}
          points={AUTH_HERO.points}
          className="flex-1"
        />
      }
    >
      <SignInForm initialError={error ? ERRORS[error] : undefined} />
    </AuthLayout>
  )
}
