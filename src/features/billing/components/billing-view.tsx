'use client'

import { AlertTriangle, Check } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { FxAlert } from '@/components/shared/fx-alert'
import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { FxConfirmDialog } from '@/components/shared/fx-confirm-dialog'
import { FxProgress } from '@/components/shared/fx-progress'
import { useFormatter } from '@/context/locale-provider'
import { cn } from '@/lib/utils'

import {
  cancelPlanChangeAction,
  cancelSubscriptionAction,
  changePlanAction,
  openCardUpdateAction,
  resumeSubscriptionAction,
} from '../actions'
import { useChargeStatusLabel, useMoney } from '../hooks/use-billing-format'
import { PAYMENT_STATUS, PAYMENT_TONE_CLASS } from '../lib/payment-status'
import type { PlanChangeQuote } from '../lib/plan-change'
import type {
  BillingCharge,
  BillingOverview,
  BillingPaymentIssue,
  BillingPlan,
  SubscriptionStatus,
} from '../types'
import { BillingPortalDialog } from './billing-portal-dialog'
import { ChangePlanDialog } from './change-plan-dialog'
import { InvoiceLink } from './invoice-link'

const STATUS: Record<
  SubscriptionStatus,
  { label: string; variant: 'success' | 'info' | 'warning' | 'destructive' }
> = {
  active: { label: 'Active', variant: 'success' },
  trialing: { label: 'Trial', variant: 'info' },
  past_due: { label: 'Past due', variant: 'warning' },
  canceled: { label: 'Canceled', variant: 'destructive' },
}

export function BillingView({
  data,
  orgSlug,
}: {
  data: BillingOverview
  orgSlug: string
}) {
  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false)
  const [isPortalOpen, setIsPortalOpen] = useState(false)
  const { plan, charges } = data
  const [cancelling, startCancelling] = useTransition()

  // The action revalidates the page, so `data` arrives fresh; this only reports back.
  const applyChange = async (
    quote: Exclude<PlanChangeQuote, { timing: 'none' }>,
    requestId: string,
    prorationDate?: number
  ): Promise<boolean> => {
    const result = await changePlanAction(orgSlug, {
      planId: quote.target.id,
      cycle: quote.cycle,
      requestId,
      prorationDate,
    })
    if (!result.ok) {
      toast.error(result.error)
      return false
    }

    const outcome = result.data
    switch (outcome.status) {
      case 'checkout':
        window.location.assign(outcome.url)
        return true
      case 'switched':
        toast.success(`You are now on ${quote.target.name} ${quote.cycle}.`)
        return true
      case 'scheduled':
        toast.success(
          `${quote.target.name} ${quote.cycle} is booked for your renewal.`
        )
        return true
      case 'payment_failed':
        toast.error(
          'The payment did not go through, so your plan has not changed.'
        )
        if (outcome.invoiceUrl) window.open(outcome.invoiceUrl, '_blank')
        return false
      default:
        return true
    }
  }

  const fmt = useFormatter()
  const [showCancelSubscription, setShowCancelSubscription] = useState(false)
  const [cancellingSubscription, startCancellingSubscription] = useTransition()
  const cancelSubscription = () => {
    startCancellingSubscription(async () => {
      const result = await cancelSubscriptionAction(
        orgSlug,
        crypto.randomUUID()
      )
      setShowCancelSubscription(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Cancelled. You keep ${plan.name} until your plan ends.`)
    })
  }

  const [resuming, startResuming] = useTransition()
  const keepPlan = () => {
    startResuming(async () => {
      const result = await resumeSubscriptionAction(
        orgSlug,
        crypto.randomUUID()
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Your ${plan.name} plan will renew as normal.`)
    })
  }

  const cancelUpcoming = () => {
    startCancelling(async () => {
      const result = await cancelPlanChangeAction(orgSlug, crypto.randomUUID())
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`You stay on ${plan.name}.`)
    })
  }

  return (
    <div className="flex w-full flex-col gap-5 md:p-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-[24px] font-medium tracking-tight">
          Billing &amp; plan
        </h1>
        <p className="text-muted-foreground text-[14px]">
          Your agency subscription - Stripe Checkout keeps this in sync.
        </p>
      </div>

      {data.paymentIssue && (
        <PaymentIssueAlert issue={data.paymentIssue} orgSlug={orgSlug} />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <PlanCard
          plan={plan}
          credit={data.credit}
          cancelling={cancelling}
          resuming={resuming}
          onChangePlan={() => setIsChangePlanOpen(true)}
          onManage={() => setIsPortalOpen(true)}
          onCancelUpcoming={cancelUpcoming}
          onKeepPlan={keepPlan}
          onCancelSubscription={() => setShowCancelSubscription(true)}
        />
        <div className="flex flex-col gap-4">
          <PlanUnlocksCard unlocks={data.unlocks} />
          <RecentChargesCard charges={charges} />
        </div>
      </div>

      <ChangePlanDialog
        open={isChangePlanOpen}
        onOpenChange={setIsChangePlanOpen}
        current={plan}
        plans={data.plans}
        orgSlug={orgSlug}
        accountCredit={data.credit?.amount ?? 0}
        onConfirm={applyChange}
      />

      <FxConfirmDialog
        open={showCancelSubscription}
        onOpenChange={setShowCancelSubscription}
        destructive
        isPending={cancellingSubscription}
        title="Cancel your subscription?"
        description={[
          `You keep ${plan.name} until ${
            plan.renewsAt
              ? fmt.date(plan.renewsAt, 'date')
              : 'the end of this period'
          }, then move to Free. There are no more charges, and you can undo this any time before then.`,
          plan.upcoming
            ? `Your booked change to ${plan.upcoming.planName} ${plan.upcoming.cycle} is dropped.`
            : null,
        ]
          .filter(Boolean)
          .join(' ')}
        confirmLabel="Cancel subscription"
        cancelLabel="Keep subscription"
        pendingLabel="Cancelling…"
        onConfirm={cancelSubscription}
      />

      <BillingPortalDialog
        open={isPortalOpen}
        onOpenChange={setIsPortalOpen}
        orgSlug={orgSlug}
        plan={plan}
        charges={charges}
        credit={data.credit}
        onCancelSubscription={() => setShowCancelSubscription(true)}
      />
    </div>
  )
}

function PlanCard({
  plan,
  credit,
  cancelling,
  resuming,
  onChangePlan,
  onManage,
  onCancelUpcoming,
  onKeepPlan,
  onCancelSubscription,
}: {
  plan: BillingPlan
  credit: BillingOverview['credit']
  cancelling: boolean
  resuming: boolean
  onChangePlan: () => void
  onManage: () => void
  onCancelUpcoming: () => void
  onKeepPlan: () => void
  onCancelSubscription: () => void
}) {
  const fmt = useFormatter()
  const money = useMoney()
  const status = STATUS[plan.status]
  const totalSeats = plan.totalSeats || 1
  const pct = Math.min(Math.round((plan.usedSeats / totalSeats) * 100), 100)

  return (
    <FxCard className="dark:bg-card self-start bg-[radial-gradient(ellipse_at_top_left,var(--card)_0%,var(--card)_35%,var(--background)_100%)] dark:bg-none">
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
          {plan.cancelsAt ? (
            <FxBadge variant="warning" size="sm">
              Ends {fmt.date(plan.cancelsAt, 'day')}
            </FxBadge>
          ) : (
            <FxBadge variant={status.variant} size="sm">
              {status.label}
            </FxBadge>
          )}
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
            <dt className="text-muted-foreground">
              {plan.cancelsAt ? 'Plan ends' : 'Next renewal'}
            </dt>
            <dd className="text-foreground font-medium">
              {plan.cancelsAt
                ? fmt.date(plan.cancelsAt, 'date')
                : plan.renewsAt
                  ? fmt.date(plan.renewsAt, 'date')
                  : '-'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Payment method</dt>
            <dd className="text-foreground font-mono font-medium">
              {plan.paymentMethod
                ? `${plan.paymentMethod.brand} ···· ${plan.paymentMethod.last4}`
                : '-'}
            </dd>
          </div>
          {credit && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">
                Account credit
                <span className="text-subtle-foreground block text-[12px]">
                  Taken off your next bills
                </span>
              </dt>
              <dd className="text-success font-mono font-semibold">
                {money(credit.amount, credit.currency)}
              </dd>
            </div>
          )}
        </dl>

        {plan.cancelsAt && (
          <div className="border-warning/30 bg-warning-subtle flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-[13px]">
            <p className="text-foreground">
              <span className="text-warning font-semibold">Cancelled:</span> you
              keep {plan.name} until {fmt.date(plan.cancelsAt, 'date')}, then
              move to Free. No more charges.
            </p>
            <button
              type="button"
              disabled={resuming}
              onClick={onKeepPlan}
              className="text-foreground shrink-0 cursor-pointer border-b-2 border-current text-[13px] leading-tight font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              {resuming ? 'Keeping…' : 'Keep my plan'}
            </button>
          </div>
        )}

        {plan.upcoming && (
          <div className="border-info/30 bg-info-subtle flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-[13px]">
            <p className="text-foreground">
              <span className="text-info font-semibold">Upcoming:</span>{' '}
              <span className="capitalize">
                {plan.upcoming.planName} {plan.upcoming.cycle}
              </span>{' '}
              from {fmt.date(plan.upcoming.effectiveAt, 'date')}
            </p>
            <button
              type="button"
              disabled={cancelling}
              onClick={onCancelUpcoming}
              className="text-foreground shrink-0 cursor-pointer border-b-2 border-current text-[13px] leading-tight font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              {cancelling ? 'Cancelling…' : 'Cancel change'}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <FxButton className="flex-1" onClick={onManage}>
            Manage in Stripe
          </FxButton>
          <FxButton variant="secondary" onClick={onChangePlan}>
            Change plan
          </FxButton>
        </div>

        {/* A paid plan that is not already ending. Free has nothing to cancel. */}
        {plan.planId !== 'free' && plan.renewsAt && !plan.cancelsAt && (
          <FxButton
            type="button"
            variant="secondary"
            className="hover:text-destructive hover:border-destructive w-full hover:bg-transparent"
            onClick={onCancelSubscription}
          >
            Cancel subscription
          </FxButton>
        )}
      </FxCardContent>
    </FxCard>
  )
}

function PaymentIssueAlert({
  issue,
  orgSlug,
}: {
  issue: BillingPaymentIssue
  orgSlug: string
}) {
  const fmt = useFormatter()
  const money = useMoney()
  const [opening, startOpening] = useTransition()
  const amount = money(issue.amount, issue.currency)

  const updateCard = () => {
    startOpening(async () => {
      const result = await openCardUpdateAction(orgSlug)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      window.location.assign(result.data.url)
    })
  }

  const failed = issue.status === 'failed'

  return (
    <FxAlert tone={failed ? 'destructive' : 'warning'} role="alert">
      <AlertTriangle aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">
            {failed
              ? `Your last payment of ${amount} failed.`
              : `Your bank needs you to confirm the ${amount} payment.`}
          </p>
          <p className="text-[13px] opacity-90">
            {failed
              ? [
                  issue.message,
                  issue.nextAttemptAt
                    ? `Stripe tries again on ${fmt.date(issue.nextAttemptAt, 'date')}.`
                    : 'Stripe has stopped retrying - pay now to keep your plan.',
                ]
                  .filter(Boolean)
                  .join(' ')
              : 'Nothing is charged until you confirm it with your bank.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {failed && (
            <FxButton
              size="sm"
              variant="secondary"
              disabled={opening}
              onClick={updateCard}
            >
              {opening ? 'Opening…' : 'Update card'}
            </FxButton>
          )}
          {issue.invoiceUrl && (
            <FxButton size="sm" asChild>
              <a href={issue.invoiceUrl} target="_blank" rel="noreferrer">
                {failed ? 'Pay now' : 'Confirm payment'}
              </a>
            </FxButton>
          )}
        </div>
      </div>
    </FxAlert>
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
  const money = useMoney()
  const statusLabel = useChargeStatusLabel()

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
                <span className="flex shrink-0 items-center gap-2.5">
                  {/* "Paid" is the normal case - only anything else is called out. */}
                  {charge.status !== 'paid' && (
                    <span
                      className={cn(
                        'text-[12px] font-medium',
                        PAYMENT_TONE_CLASS[PAYMENT_STATUS[charge.status].tone]
                      )}
                    >
                      {statusLabel(charge)}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-foreground font-medium',
                      (charge.status === 'refunded' ||
                        charge.status === 'void') &&
                        'text-subtle-foreground line-through'
                    )}
                  >
                    {money(charge.amount, charge.currency)}
                  </span>
                  <InvoiceLink href={charge.invoiceUrl} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </FxCardContent>
    </FxCard>
  )
}
