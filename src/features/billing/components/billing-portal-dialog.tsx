'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'

import { DemoDisabled } from '@/components/shared/demo-disabled'
import { FxButton } from '@/components/shared/fx-button'
import { FxDialogClose } from '@/components/shared/fx-dialog-close'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useFormatter } from '@/context/locale-provider'
import { cn } from '@/lib/utils'

import { openCardUpdateAction } from '../actions'
import {
  useChargeStatusLabel,
  useCreditNote,
  useMoney,
} from '../hooks/use-billing-format'
import { PAYMENT_STATUS, PAYMENT_TONE_CLASS } from '../lib/payment-status'
import type { BillingCharge, BillingOverview, BillingPlan } from '../types'
import { InvoiceLink } from './invoice-link'

export function BillingPortalDialog({
  open,
  onOpenChange,
  orgSlug,
  plan,
  charges,
  credit,
  onCancelSubscription,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgSlug: string
  plan: BillingPlan
  charges: BillingCharge[]
  credit: BillingOverview['credit']
  onCancelSubscription: () => void
}) {
  const fmt = useFormatter()
  const [opening, startOpening] = useTransition()

  const money = useMoney()
  const statusLabel = useChargeStatusLabel()
  const creditNote = useCreditNote()

  const card = plan.paymentMethod
  const expiry =
    card?.expMonth && card.expYear
      ? `${String(card.expMonth).padStart(2, '0')} / ${String(card.expYear).slice(-2)}`
      : null

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

  return (
    <Dialog open={open} onOpenChange={(next) => !opening && onOpenChange(next)}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-120"
        showCloseButton={false}
      >
        <div className="border-border flex shrink-0 items-center justify-between gap-4 border-b px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="text-brand-white flex size-6 shrink-0 items-center justify-center rounded-md bg-[#635bff] text-[12px] font-bold"
            >
              S
            </span>
            <DialogTitle className="text-foreground text-[15.5px] font-semibold">
              Stripe billing portal
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Your card, subscription and invoices.
          </DialogDescription>
          <FxDialogClose
            disabled={opening}
            onClick={() => onOpenChange(false)}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-xl border p-3.5 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-[10.5px] font-bold tracking-wide">
                CARD
              </span>
              <div className="min-w-0">
                <p className="text-foreground truncate font-mono text-[14px] font-semibold">
                  {card
                    ? `${card.brand} ···· ${card.last4}`
                    : 'No card on file'}
                </p>
                {expiry && (
                  <p className="text-muted-foreground text-[12px]">
                    Expires {expiry}
                  </p>
                )}
              </div>
            </div>
            {plan.renewsAt && (
              <DemoDisabled className="shrink-0">
                <button
                  type="button"
                  disabled={opening}
                  onClick={updateCard}
                  className="text-foreground shrink-0 cursor-pointer border-b-2 border-current text-[13.5px] leading-tight font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {opening ? 'Opening…' : 'Update'}
                </button>
              </DemoDisabled>
            )}
          </div>

          <dl className="border-border space-y-3 border-b pb-5 text-[13.5px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">Subscription</dt>
              <dd className="text-foreground min-w-0 text-right font-semibold">
                {plan.name} plan · {money(plan.price, plan.currency)} /{' '}
                {plan.cycle === 'yearly' ? 'year' : 'month'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">
                {plan.cancelsAt ? 'Ends' : 'Next charge'}
              </dt>
              <dd className="text-foreground min-w-0 text-right font-semibold">
                {plan.cancelsAt
                  ? fmt.date(plan.cancelsAt, 'date')
                  : plan.renewsAt
                    ? fmt.date(plan.renewsAt, 'date')
                    : '-'}
              </dd>
            </div>
            {plan.upcoming && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">Then</dt>
                <dd className="text-foreground min-w-0 text-right font-semibold capitalize">
                  {plan.upcoming.planName} {plan.upcoming.cycle}
                </dd>
              </div>
            )}
            {credit && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">
                  Account credit
                </dt>
                <dd className="text-success min-w-0 text-right font-semibold">
                  {money(credit.amount, credit.currency)}
                </dd>
              </div>
            )}
          </dl>

          <section className="space-y-1">
            <h3 className="text-muted-foreground pb-1 text-[11px] font-semibold tracking-wide uppercase">
              Invoices
            </h3>
            {charges.length === 0 ? (
              <p className="text-muted-foreground py-2 text-[13px]">
                No invoices yet.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {charges.map((charge) => (
                  <li
                    key={charge.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]"
                  >
                    <span className="min-w-0">
                      <span className="text-muted-foreground block truncate">
                        {fmt.date(charge.date, 'day')} · {charge.description}
                      </span>
                      {/* The number printed on the invoice and receipt, so a row can be
                          matched to the PDF or email the customer has. */}
                      {charge.invoiceNumber && (
                        <span className="text-subtle-foreground block truncate font-mono text-[11.5px]">
                          {charge.invoiceNumber}
                        </span>
                      )}
                      {creditNote(charge) && (
                        <span className="text-subtle-foreground block truncate text-[12px]">
                          {creditNote(charge)}
                        </span>
                      )}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-3">
                      <span className="text-foreground font-mono font-semibold">
                        {money(charge.amount, charge.currency)}
                      </span>
                      <span
                        className={cn(
                          'text-[12.5px]',
                          PAYMENT_TONE_CLASS[PAYMENT_STATUS[charge.status].tone]
                        )}
                      >
                        {statusLabel(charge)}
                      </span>
                      <InvoiceLink href={charge.invoiceUrl} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-subtle-foreground text-xs leading-relaxed">
            Updating the card opens Stripe&apos;s secure page - card details
            never pass through Foxy HUB.
          </p>
        </div>

        <div className="border-border flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {plan.planId !== 'free' && plan.renewsAt && !plan.cancelsAt ? (
            <DemoDisabled className="flex w-full sm:w-auto">
              <FxButton
                type="button"
                variant="secondary"
                className="hover:text-destructive hover:border-destructive w-full hover:bg-transparent sm:w-auto"
                disabled={opening}
                onClick={() => {
                  onOpenChange(false)
                  onCancelSubscription()
                }}
              >
                Cancel subscription
              </FxButton>
            </DemoDisabled>
          ) : null}
          <FxButton
            type="button"
            variant="secondary"
            className="w-full sm:ml-auto sm:w-auto"
            disabled={opening}
            onClick={() => onOpenChange(false)}
          >
            Done
          </FxButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
