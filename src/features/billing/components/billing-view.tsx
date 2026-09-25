'use client'

import { Check } from 'lucide-react'
import { toast } from 'sonner'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { FxProgress } from '@/components/shared/fx-progress'
import { useFormatter } from '@/context/locale-provider'

import type {
  BillingCharge,
  BillingOverview,
  BillingPlan,
  SubscriptionStatus,
} from '../types'

const STATUS: Record<
  SubscriptionStatus,
  { label: string; variant: 'success' | 'info' | 'warning' | 'destructive' }
> = {
  active: { label: 'Active', variant: 'success' },
  trialing: { label: 'Trial', variant: 'info' },
  past_due: { label: 'Past due', variant: 'warning' },
  canceled: { label: 'Canceled', variant: 'destructive' },
}

// Placeholder until the Stripe portal / checkout sessions are wired up.
const notYet = () => toast.info('Stripe billing is coming soon.')

export function BillingView({ data }: { data: BillingOverview }) {
  return (
    <div className="flex w-full flex-col gap-5 md:p-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-[24px] font-medium tracking-tight">
          Billing &amp; plan
        </h1>
        <p className="text-muted-foreground text-[14px]">
          Your agency subscription — Stripe Checkout keeps this in sync.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <PlanCard plan={data.plan} />
        <div className="flex flex-col gap-4">
          <PlanUnlocksCard unlocks={data.unlocks} />
          <RecentChargesCard charges={data.charges} />
        </div>
      </div>
    </div>
  )
}

function PlanCard({ plan }: { plan: BillingPlan }) {
  const fmt = useFormatter()
  const status = STATUS[plan.status]
  const totalSeats = plan.totalSeats || 1
  const pct = Math.min(Math.round((plan.usedSeats / totalSeats) * 100), 100)

  return (
    <FxCard className="self-start">
      <FxCardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold">
              {plan.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h2 className="text-foreground text-[16px] font-semibold">
                {plan.name} plan
              </h2>
              <p className="text-muted-foreground text-[12px]">
                Billed {plan.cycle}
              </p>
            </div>
          </div>
          <FxBadge variant={status.variant} size="sm">
            {status.label}
          </FxBadge>
        </div>

        <p className="flex items-baseline gap-1.5">
          <span className="text-foreground text-[34px] leading-none font-semibold tracking-tight">
            {fmt.currency(plan.price, plan.currency)}
          </span>
          <span className="text-muted-foreground text-[14px]">
            / {plan.cycle === 'yearly' ? 'year' : 'month'}
          </span>
        </p>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">Seats used</span>
            <span className="text-foreground font-medium">
              {plan.usedSeats} of {plan.totalSeats}
            </span>
          </div>
          <FxProgress value={pct} aria-label="Seats used" />
        </div>

        <dl className="space-y-2.5 text-[13px]">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Next renewal</dt>
            <dd className="text-foreground font-medium">
              {plan.renewsAt ? fmt.date(plan.renewsAt, 'date') : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Payment method</dt>
            <dd className="text-foreground font-mono font-medium">
              {plan.paymentMethod
                ? `${plan.paymentMethod.brand} ···· ${plan.paymentMethod.last4}`
                : '—'}
            </dd>
          </div>
        </dl>

        <div className="flex gap-2">
          <FxButton className="flex-1" onClick={notYet}>
            Manage in Stripe
          </FxButton>
          <FxButton variant="secondary" onClick={notYet}>
            Change plan
          </FxButton>
        </div>
      </FxCardContent>
    </FxCard>
  )
}

function PlanUnlocksCard({ unlocks }: { unlocks: string[] }) {
  return (
    <FxCard>
      <FxCardContent className="p-5">
        <h2 className="text-foreground text-[14px] font-semibold">
          Plan unlocks
        </h2>
        <p className="text-muted-foreground mt-0.5 text-[12px]">
          Gated behind an active subscription.
        </p>
        <ul className="mt-4 space-y-2.5">
          {unlocks.map((item) => (
            <li
              key={item}
              className="text-foreground flex items-center gap-2.5 text-[13px]"
            >
              <Check className="text-success size-4 shrink-0" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </FxCardContent>
    </FxCard>
  )
}

function RecentChargesCard({ charges }: { charges: BillingCharge[] }) {
  const fmt = useFormatter()

  return (
    <FxCard>
      <FxCardContent className="p-5">
        <h2 className="text-foreground text-[14px] font-semibold">
          Recent charges
        </h2>
        {charges.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-[13px]">
            No charges yet.
          </p>
        ) : (
          <ul className="divide-border border-border mt-3 divide-y border-b">
            {charges.map((charge) => (
              <li
                key={charge.id}
                className="flex items-center justify-between gap-4 py-2.5 text-[13px]"
              >
                <span className="text-muted-foreground">
                  {fmt.date(charge.date, 'day')} · {charge.description}
                </span>
                <span className="text-foreground font-medium">
                  {fmt.currency(charge.amount, charge.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </FxCardContent>
    </FxCard>
  )
}
