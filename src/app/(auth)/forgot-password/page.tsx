import { AuthLayout } from '@/components/layout/auth'
import { AuthHeroPanel } from '@/components/shared/app/auth-hero-panel'
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form'
import {
  AUTH_CARD_TAGLINE,
  AUTH_HERO,
  FORGOT_PASSWORD,
  SIGN_IN,
} from '@/features/auth/data'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
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
        {FORGOT_PASSWORD.title}
      </h1>
      <p className="text-muted-foreground mb-8 text-lg leading-normal">
        {FORGOT_PASSWORD.subtitle}
      </p>
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
