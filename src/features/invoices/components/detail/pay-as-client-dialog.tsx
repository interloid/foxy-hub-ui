'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxDialogClose } from '@/components/shared/fx-dialog-close'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLocale } from '@/context/locale-provider'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { formatCurrency } from '@/lib/money'

import { getInvoiceStatusAction } from '../../actions'

import type { InvoiceDetail } from './types'

// How often the dialog asks whether the webhook has marked the invoice paid yet. Card
// payments usually land within a few seconds of the client pressing Pay.
const POLL_MS = 3000

type Step = 'processing' | 'success'

/**
 * Shown while the Stripe-hosted page is open in another tab. It doesn't take the payment
 * itself - it waits for `invoice.paid` to reach the webhook and the row to flip, then says
 * so. "TEST" shows when the hosted page is a test-mode one.
 */
export function PayAsClientDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const locale = useLocale()
  const router = useRouter()
  const { orgSlug } = useWorkspace()
  const [step, setStep] = useState<Step>('processing')
  // Stripe's test-mode hosted invoice links carry a `test_` path segment.
  const isTestMode = /\/test_/.test(invoice.invoiceUrl ?? '')

  // Poll while open; stop on paid, and refresh the page so the badge and history update.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      const res = await getInvoiceStatusAction(orgSlug, invoice.id)
      if (cancelled) return
      if (res.ok && res.data.paid) {
        setStep('success')
        router.refresh()
        return
      }
      timer = setTimeout(check, POLL_MS)
    }
    timer = setTimeout(check, POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      setStep('processing')
    }
  }, [open, orgSlug, invoice.id, router])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <header className="border-border flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              // Stripe's own purple - this panel stands in for their checkout.
              className="flex size-7 items-center justify-center rounded-md bg-[#635bff] text-sm font-bold text-white"
            >
              S
            </span>
            <DialogTitle className="text-foreground text-[14px] font-semibold">
              Stripe Checkout
            </DialogTitle>
            {isTestMode && (
              <FxBadge variant="warning" size="sm">
                TEST
              </FxBadge>
            )}
          </div>
          <DialogClose asChild>
            <FxDialogClose className="border-border bg-muted/50 size-8 rounded-md border [&_svg]:size-4" />
          </DialogClose>
        </header>

        <div className="space-y-6 px-5 pt-7 pb-5 text-center">
          <div className="space-y-1">
            <p className="text-muted-foreground text-[13px]">
              {invoice.client.name} · {invoice.project.name}
            </p>
            <p className="text-foreground text-[34px] leading-tight font-bold">
              {formatCurrency(invoice.total, invoice.currency, { locale })}
            </p>
            <p className="text-muted-foreground font-mono text-[12.5px]">
              {invoice.number}
            </p>
          </div>

          {step === 'processing' ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 pb-4"
            >
              <span
                aria-hidden="true"
                className="border-muted size-9 animate-spin rounded-full border-[3px] border-t-[#635bff]"
              />
              <DialogDescription className="text-muted-foreground text-[13px]">
                Processing payment...
              </DialogDescription>
              <p className="text-subtle-foreground text-[11.5px]">
                Finish paying in the Stripe tab - this updates on its own.
              </p>
            </div>
          ) : (
            <div role="status" aria-live="polite" className="space-y-5">
              <div className="flex flex-col items-center gap-3">
                <span className="bg-success-subtle text-success flex size-13 items-center justify-center rounded-full">
                  <Check className="size-6" aria-hidden="true" />
                </span>
                <p className="text-foreground text-[15px] font-semibold">
                  Payment successful
                </p>
                <DialogDescription className="text-muted-foreground max-w-80 text-[12.5px] leading-relaxed">
                  A signed webhook flipped {invoice.number} to{' '}
                  <span className="text-success font-semibold">Paid</span> - the
                  agency dashboard updated live, no manual step.
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <FxButton type="button" className="h-11 w-full text-[14px]">
                  Done
                </FxButton>
              </DialogClose>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
