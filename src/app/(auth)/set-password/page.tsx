import { redirect } from 'next/navigation'

import { AuthLayout } from '@/components/layout/auth'
import { AuthHeroPanel } from '@/components/shared/app/auth-hero-panel'
import { SetPasswordForm } from '@/features/auth/components/set-password-form'
import { AUTH_CARD_TAGLINE, AUTH_HERO, SIGN_IN } from '@/features/auth/data'
import { verifySession } from '@/lib/dal'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Choose a password',
  robots: { index: false, follow: false },
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; forgot?: string }>
}) {
  const session = await verifySession()
  if (!session) redirect('/sign-in?error=session_expired')

  const { next, reset, forgot } = await searchParams
  const isReset = reset === '1' || forgot === '1'
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/'

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
        Choose a password
      </h1>
      <p className="text-muted-foreground mb-8 text-lg leading-normal">
        {isReset
          ? "Pick a new password for your account. You'll use it to sign in from now on."
          : 'Your workspace is ready. Set a password so you can sign in directly next time.'}
      </p>
      <SetPasswordForm next={safeNext} forgot={forgot} />
    </AuthLayout>
  )
}
