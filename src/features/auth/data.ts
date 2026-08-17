import type { NavIconName } from '@/components/layout/nav-icons'

export const SIGN_IN = {
  brand: { name: 'Foxy HUB', mark: 'F' },
  title: 'Sign in to your workspace',
  subtitle:
    'Manage projects, collaborate with clients, and get paid — all in one portal.',

  email: { label: 'Work email', placeholder: 'you@agency.com' },
  password: { label: 'Password' },
  submit: 'Sign in',
  divider: 'or',
  demo: {
    label: 'Log in as demo — no sign-up',
    note: 'Demo drops you into a fully seeded agency in seconds. Test-mode Stripe; no real data.',
  },

  alternatives: [
    { prompt: 'New agency?', label: 'Create a workspace', href: '/onboard' },
    {
      prompt: 'Forgot your password?',
      label: 'Reset it',
      href: '/forgot-password',
    },
  ],
} as const

export const FORGOT_PASSWORD = {
  title: 'Reset your password',
  subtitle:
    "Enter your work email and we'll send you a link to choose a new password.",
  submit: 'Email me a reset link',
  back: 'Back to sign in',

  sent: (address: string) =>
    `If an account exists for ${address}, a reset link is on its way.`,
} as const

export const CHANGE_PASSWORD = {
  back: { label: 'Back to profile', href: '/profile' },
  title: 'Change password',
  subtitle: 'Use at least 8 characters with a mix of letters and numbers.',
  current: 'Current password',
  next: 'New password',
  confirm: 'Confirm new password',
  cancel: 'Cancel',
  submit: 'Update password',
  saved: 'Password updated successfully.',
} as const

export const AUTH_CARD_TAGLINE =
  'Projects, approvals & invoices — one polished client portal.'

export type AuthHeroPoint = { icon: NavIconName; label: string }

export const AUTH_HERO = {
  image: { src: '/auth-hero.webp', width: 687, height: 1024 },
  eyebrow: 'The agency client portal',
  headline:
    'One polished place for projects, approvals, and invoices — so clients see exactly where things stand.',
  points: [
    { icon: 'approvals', label: 'Real-time approvals & updates' },
    { icon: 'invoices', label: 'Stripe subscriptions & invoices' },
    { icon: 'ai', label: 'AI-drafted weekly updates' },
  ] satisfies AuthHeroPoint[],
} as const
