import { redirect } from 'next/navigation'

import { AuthLayout } from '@/components/layout/auth'
import { AuthHeroPanel } from '@/components/shared/app/auth-hero-panel'
import { MfaVerifyForm } from '@/features/auth/components/mfa-verify-form'
import { AUTH_CARD_TAGLINE, AUTH_HERO, SIGN_IN } from '@/features/auth/data'
import { verifySession } from '@/lib/dal'
import { safeNextPath } from '@/lib/mfa'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Two-factor authentication',
  robots: { index: false, follow: false },
}

export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await verifySession()
  if (!session) redirect('/sign-in?error=session_expired')

  const { next } = await searchParams

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
      <h1 className="mb-2 text-5xl leading-normal font-semibold">
        Enter your code
      </h1>
      <p className="text-muted-foreground mb-8 text-lg leading-normal">
        Open your authenticator app and enter the 6-digit code for Foxy HUB
        {session.email ? ` (${session.email})` : ''}.
      </p>
      <MfaVerifyForm next={safeNextPath(next)} />
    </AuthLayout>
  )
}
