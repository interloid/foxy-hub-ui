'use client'

import { useState, useTransition } from 'react'

import {
  type BillingCycle,
  BillingCycleToggle,
} from '@/components/shared/app/billing-cycle-toggle'
import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxDialogClose } from '@/components/shared/fx-dialog-close'
import { FxConfirmDialog } from '@/components/shared/fx-confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useFormatter } from '@/context/locale-provider'
import { cn } from '@/lib/utils'

import {
  type PlanChangeQuote,
  priceFor,
  quotePlanChange,
} from '../lib/plan-change'
import { type PlanChangePreview, previewPlanChangeAction } from '../actions'
import type { BillingPlan, PlanOption } from '../types'

type Quote = Exclude<PlanChangeQuote, { timing: 'none' }>

const CYCLE_UNIT: Record<BillingCycle, string> = { monthly: 'mo', yearly: 'yr' }

export function ChangePlanDialog({
  open,
  onOpenChange,
  current,
  plans,
  orgSlug,
  accountCredit = 0,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: BillingPlan
  plans: PlanOption[]
  orgSlug: string
  accountCredit?: number
  onConfirm: (
    quote: Quote,
    requestId: string,
    prorationDate?: number
  ) => Promise<boolean>
}) {
  const fmt = useFormatter()
  const [cycle, setCycle] = useState<BillingCycle>(current.cycle)
  const [selected, setSelected] = useState<Quote | null>(null)
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false)
  const [requestId, setRequestId] = useState('')

  const [preview, setPreview] = useState<{
    key: string
    status: 'loading' | 'ready' | 'failed'
    data?: PlanChangePreview
  } | null>(null)
  const keyOf = (quote: Quote) => `${quote.target.id}:${quote.cycle}`

  const choose = (quote: Quote) => {
    setRequestId(crypto.randomUUID())
    setSelected(quote)

    if (quote.timing !== 'now' || current.planId === 'free') {
      setPreview(null)
      return
    }
    const key = keyOf(quote)
    setPreview({ key, status: 'loading' })
    previewPlanChangeAction(orgSlug, {
      planId: quote.target.id,
      cycle: quote.cycle,
    })
      .then((result) =>
        setPreview((prev) =>
          prev?.key !== key
            ? prev
            : result.ok && result.data
              ? { key, status: 'ready', data: result.data }
              : { key, status: 'failed' }
        )
      )
      .catch(() =>
        setPreview((prev) =>
          prev?.key === key ? { key, status: 'failed' } : prev
        )
      )
  }
  const [pending, startTransition] = useTransition()

  const exact = (amount: number) =>
    fmt.currency(amount, current.currency, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  const whole = (amount: number) => fmt.currency(amount, current.currency)

  const handleOpenChange = (next: boolean) => {
    if (pending) return
    if (!next) {
      setCycle(current.cycle)
      setSelected(null)
    }
    onOpenChange(next)
  }

  const confirm = () => {
    if (!selected) return
    startTransition(async () => {
      const ok = await onConfirm(
        selected,
        requestId,
        previewReady ? forSelected?.data?.prorationDate : undefined
      )
      if (ok) {
        setSelected(null)
        onOpenChange(false)
      } else {
        setRequestId(crypto.randomUUID())
      }
    })
  }

  const currentName = `${current.name} ${current.cycle}`

  const forSelected =
    selected?.timing === 'now' && preview?.key === keyOf(selected)
      ? preview
      : null
  const previewReady = forSelected?.status === 'ready'
  const checking = forSelected?.status === 'loading'
  const amounts =
    selected?.timing === 'now'
      ? previewReady && forSelected?.data
        ? forSelected.data
        : selected
      : null
  const chargedTo =
    current.planId === 'free'
      ? null
      : current.paymentMethod
        ? `${current.paymentMethod.brand} ···· ${current.paymentMethod.last4}`
        : 'Your card on file'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-180"
        showCloseButton={false}
      >
        <div className="border-border flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:px-5">
          <div className="min-w-0 space-y-0.5">
            <DialogTitle className="text-foreground text-[17px] font-semibold">
              {selected ? 'Confirm plan change' : 'Change plan'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-[13px]">
              Upgrades and moves to a yearly plan start today; other downgrades
              wait until your plan renews.
            </DialogDescription>
          </div>
          <FxDialogClose
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          />
        </div>

        {selected ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            <div className="border-border bg-muted/40 space-y-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3 text-[13px]">
                <span className="text-muted-foreground">From</span>
                <span className="text-foreground min-w-0 text-right font-medium capitalize">
                  {currentName}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3 text-[13px]">
                <span className="text-muted-foreground">To</span>
                <span className="text-foreground min-w-0 text-right font-semibold capitalize">
                  {selected.target.name} {selected.cycle}
                </span>
              </div>
            </div>

            {selected.timing === 'now' &&
              current.cycle === 'yearly' &&
              selected.cycle === 'monthly' &&
              amounts!.leftoverCredit > 0 && (
                <div className="border-info/30 bg-info-subtle space-y-2.5 rounded-lg border px-3.5 py-3 text-[13px]">
                  <p className="text-foreground leading-relaxed">
                    You have {exact(amounts!.credit)} of unused yearly credit.
                    On {selected.target.name} monthly,{' '}
                    {exact(amounts!.leftoverCredit)} of it is left over as
                    account credit. On {selected.target.name} yearly, it all
                    goes towards the year.
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const yearly = quotePlanChange({
                        current,
                        plans,
                        target: selected.target,
                        cycle: 'yearly',
                        accountCredit,
                      })
                      if (yearly.timing === 'none') return
                      setCycle('yearly')
                      choose(yearly)
                    }}
                    className="text-foreground cursor-pointer border-b-2 border-current text-[13px] leading-tight font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Switch to {selected.target.name} yearly instead
                  </button>
                </div>
              )}

            {selected.timing === 'now' ? (
              <div className="space-y-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground capitalize">
                    {selected.target.name} {selected.cycle}, from today
                  </span>
                  <span className="text-foreground">
                    {checking ? '…' : exact(amounts!.newPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Unused {current.name} credit
                  </span>
                  <span className="text-success">
                    {checking ? '…' : `-${exact(amounts!.credit)}`}
                  </span>
                </div>
                {amounts!.accountCredit > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      Account credit
                    </span>
                    <span className="text-success">
                      {checking ? '…' : `-${exact(amounts!.accountCredit)}`}
                    </span>
                  </div>
                )}
                <div className="border-border flex items-center justify-between gap-3 border-t pt-2.5">
                  <span className="text-foreground font-semibold">
                    Due today
                  </span>
                  <span className="text-foreground font-mono text-[15px] font-bold">
                    {checking ? '…' : exact(amounts!.dueNow)}
                  </span>
                </div>

                {amounts!.dueNow > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {chargedTo ? 'Charged to' : 'Paid on'}
                    </span>
                    <span className="text-foreground min-w-0 text-right font-mono font-medium">
                      {chargedTo ?? "Stripe's secure checkout"}
                    </span>
                  </div>
                )}
                <p className="text-muted-foreground pt-1 text-xs leading-relaxed">
                  {forSelected?.status === 'failed' &&
                    'These figures are an estimate - Stripe charges the exact prorated amount. '}
                  Your new billing period starts today. After this you pay{' '}
                  {whole(selected.newPrice)} / {CYCLE_UNIT[selected.cycle]},
                  next on {fmt.date(selected.renewsAt, 'date')}.
                  {amounts!.leftoverCredit > 0 &&
                    ` The leftover ${exact(amounts!.leftoverCredit)} stays on your account and pays toward the next bills.`}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-[13px] leading-relaxed">
                Nothing is charged today. You keep {current.name} until{' '}
                <span className="text-foreground font-medium">
                  {fmt.date(selected.effectiveAt, 'date')}
                </span>
                , then move to {selected.target.name} at{' '}
                {whole(selected.newPrice)} / {CYCLE_UNIT[selected.cycle]}. You
                can cancel the change any time before then.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <FxButton
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={pending}
                onClick={() => setSelected(null)}
              >
                Back
              </FxButton>
              <FxButton
                type="button"
                className="w-full sm:w-auto"
                disabled={pending || checking}
                onClick={() =>
                  // Losing features today deserves a second look before paying.
                  selected.timing === 'now' && selected.downgrade
                    ? setShowDowngradeConfirm(true)
                    : confirm()
                }
              >
                {pending
                  ? 'Working…'
                  : selected.timing === 'now'
                    ? checking
                      ? 'Checking the exact amount…'
                      : `Pay ${exact(amounts!.dueNow)} and switch`
                    : 'Schedule change'}
              </FxButton>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            <div className="flex justify-center">
              <BillingCycleToggle value={cycle} onValueChange={setCycle} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => {
                const isCurrentPlan = plan.id === current.planId
                const quote = quotePlanChange({
                  current,
                  plans,
                  target: plan,
                  cycle,
                  accountCredit,
                })
                const isUpcoming =
                  current.upcoming?.planId === plan.id &&
                  current.upcoming.cycle === cycle
                // Any downgrade, now or at renewal, must fit the team.
                const notEnoughSeats =
                  quote.timing !== 'none' && quote.notEnoughSeats

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'flex flex-col rounded-xl border p-4',
                      isCurrentPlan
                        ? 'border-primary bg-primary-subtle'
                        : 'border-border bg-muted/60'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-foreground text-[14px] font-semibold">
                        {plan.name}
                      </h3>
                      {isCurrentPlan && (
                        <FxBadge
                          size="sm"
                          className="bg-card text-primary-accent"
                        >
                          Current
                        </FxBadge>
                      )}
                      {isUpcoming && (
                        <FxBadge size="sm" variant="info">
                          Upcoming
                        </FxBadge>
                      )}
                    </div>

                    <p className="text-foreground mt-3 font-mono text-[22px] font-bold">
                      {whole(priceFor(plan, cycle))} / {CYCLE_UNIT[cycle]}
                    </p>

                    <p className="text-muted-foreground mt-3 text-[13px] leading-relaxed">
                      {plan.description}
                    </p>
                    <p className="text-subtle-foreground mt-3 text-[12.5px]">
                      {plan.seats} seats
                    </p>

                    <div className="mt-auto pt-5">
                      {quote.timing === 'none' ? (
                        <p className="text-subtle-foreground py-2 text-center text-[13px] font-semibold">
                          Current plan
                        </p>
                      ) : isUpcoming ? (
                        <p className="text-subtle-foreground py-2 text-center text-[13px] font-semibold">
                          Starts{' '}
                          {fmt.date(current.upcoming!.effectiveAt, 'day')}
                        </p>
                      ) : (
                        <FxButton
                          type="button"
                          variant="secondary"
                          className="w-full"
                          disabled={notEnoughSeats}
                          onClick={() => choose(quote)}
                        >
                          {notEnoughSeats
                            ? 'Not enough seats'
                            : buttonLabel(quote, isCurrentPlan)}
                        </FxButton>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-muted-foreground text-xs">
              Downgrades need enough seats for everyone still active -
              deactivate someone in People first.
            </p>
          </div>
        )}
      </DialogContent>

      {selected?.timing === 'now' && selected.downgrade && (
        <FxConfirmDialog
          nested
          open={showDowngradeConfirm}
          onOpenChange={setShowDowngradeConfirm}
          destructive
          title={`Downgrade to ${selected.target.name} today?`}
          description={`You lose ${current.name}'s features straight away, and your seats go from ${current.totalSeats} to ${selected.target.seats}.`}
          confirmLabel="Confirm"
          onConfirm={() => {
            setShowDowngradeConfirm(false)
            confirm()
          }}
        />
      )}
    </Dialog>
  )
}

function buttonLabel(quote: Quote, isCurrentPlan: boolean): string {
  if (isCurrentPlan) {
    return quote.timing === 'now'
      ? `Switch to ${quote.cycle}`
      : `Switch to ${quote.cycle} at renewal`
  }
  return quote.timing === 'now' && !quote.downgrade
    ? `Upgrade to ${quote.target.name}`
    : `Downgrade to ${quote.target.name}`
}
