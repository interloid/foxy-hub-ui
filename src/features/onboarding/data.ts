export const ONBOARD_STEPS = [
  { label: 'Account' },
  { label: 'Choose plan' },
  { label: 'Invite team' },
  { label: 'Confirm' },
] as const

export const ONBOARD_BRAND = { name: 'Foxy HUB', mark: 'F' }

export const ONBOARD_ACCOUNT = {
  title: 'Create your workspace',
  subtitle: 'Tell us about your agency to get set up.',
  fields: {
    name: { label: 'Name', placeholder: 'Jane Doe' },
    email: { label: 'Email', placeholder: 'you@agency.com' },
    agency: { label: 'Agency name', placeholder: 'Interloid Studio' },
    slug: {
      label: 'Workspace URL',
      placeholder: 'interloid',
      suffix: '.foxyhub.app',
    },
  },
} as const

/** Said by both the live field check and the server that re-checks on Launch. */
export const ONBOARD_TAKEN = {
  email: 'An account already exists for that email.',
  slug: 'That workspace URL is already taken.',
} as const

export const ONBOARD_PLANS_COPY = {
  title: 'Choose your plan',
  subtitle: 'Start with a 14-day free trial. Cancel anytime.',
} as const

export type OnboardPlan = {
  id: string
  name: string
  blurb: string
  priceMonthly: number
  priceYearly: number
  seats: string
  features: readonly string[]
  popular?: boolean
}

export const ONBOARD_PLANS: readonly OnboardPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For solo freelancers getting started',
    priceMonthly: 19,
    priceYearly: 190,
    seats: '2 seats',
    features: [
      'Up to 5 active projects',
      'Client portal & approvals',
      'Manual invoicing',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    blurb: 'For growing studios',
    priceMonthly: 49,
    priceYearly: 490,
    seats: '5 seats',
    features: [
      'Unlimited projects & clients',
      'AI weekly updates',
      'Stripe invoice payments',
    ],
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    blurb: 'For established agencies',
    priceMonthly: 99,
    priceYearly: 990,
    seats: '15 seats',
    features: [
      'Everything in Studio',
      'Subscriptions & retainers',
      'Priority support & SSO',
    ],
  },
]

export const ONBOARD_TEAM = {
  title: 'Invite your team',
  subtitle: 'Add teammates now, or skip and do it later from Settings.',
  placeholder: 'teammate@agency.com',
  roles: ['Admin', 'Member'] as const,
  initialRows: [{ role: 'Admin' }, { role: 'Member' }] as const,
  addLabel: 'Add another',
} as const

export const ONBOARD_CONFIRM = {
  title: "You're all set",
  subtitle: 'Review and launch your workspace.',
  selectedLabel: 'Selected',
  trialNote: (price: string) => `14-day free trial, then ${price}`,
  readyNote: 'Workspace, team invites, and billing are ready.',
} as const

export const ONBOARD_NAV = {
  signInInstead: 'Sign in instead',
  back: 'Back',
  next: 'Continue',
  launch: 'Launch workspace',
} as const
