'use client'

import { ArrowUpRight, Loader2 } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard } from '@/components/shared/fx-card'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { TableBody } from '@/components/ui/table'
import { startInvoicePaymentAction } from '@/features/portal/actions'
import type { PortalInvoice } from '@/features/portal/queries'
import { formatCurrency } from '@/lib/money'
import { useFormatter, useLocale } from '@/context/locale-provider'
import type { Formatter } from '@/lib/format'

const STATUS_BADGE: Record<
  PortalInvoice['status'],
  { label: string; variant: 'success' | 'default' | 'warning' | 'destructive' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  due: { label: 'Due', variant: 'default' },
  overdue: { label: 'Overdue', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  draft: { label: 'Draft', variant: 'default' },
}

function formatDate(value: string | null, fmt: Formatter): string {
  if (!value) return '—'
  return fmt.date(value, 'date') || '—'
}

export function PayNowButton({ invoice }: { invoice: PortalInvoice }) {
  const [isStarting, startPayment] = useTransition()

  if (invoice.status !== 'due' && invoice.status !== 'overdue') return null

  const pay = () => {
    if (invoice.invoiceUrl) {
      window.location.href = invoice.invoiceUrl
      return
    }

    startPayment(async () => {
      const result = await startInvoicePaymentAction(invoice.id)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      window.location.href = result.data.url
    })
  }

  return (
    <FxButton
      type="button"
      size="xs"
      disabled={isStarting}
      onClick={(e) => {
        e.stopPropagation()
        pay()
      }}
    >
      {isStarting && <Loader2 className="mr-1 size-3 animate-spin" />}
      Pay now
    </FxButton>
  )
}

export function PortalInvoicesCard({
  invoices,
}: {
  invoices: PortalInvoice[]
}) {
  const locale = useLocale()
  const fmt = useFormatter()
  return (
    <FxCard className="overflow-hidden p-0">
      <div className="w-full overflow-x-auto">
        <FxTable className="w-full min-w-160">
          <FxTableHeader>
            <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
              <FxTableHead>Invoice</FxTableHead>
              <FxTableHead>Issued</FxTableHead>
              <FxTableHead>Due</FxTableHead>
              <FxTableHead>Status</FxTableHead>
              <FxTableHead className="text-right">Amount</FxTableHead>
              <FxTableHead className="text-right">Document</FxTableHead>
            </FxTableRow>
          </FxTableHeader>

          <TableBody className="divide-border divide-y">
            {invoices.length === 0 && (
              <FxTableRow>
                <FxTableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  No invoices for this project yet.
                </FxTableCell>
              </FxTableRow>
            )}

            {invoices.map((invoice) => {
              const badge = STATUS_BADGE[invoice.status]

              return (
                <FxTableRow key={invoice.id} className="h-14">
                  <FxTableCell className="text-foreground align-middle text-[13.5px] font-semibold">
                    {invoice.number}
                  </FxTableCell>

                  <FxTableCell className="text-muted-foreground align-middle text-[13px]">
                    {formatDate(invoice.issuedAt, fmt)}
                  </FxTableCell>

                  <FxTableCell className="text-muted-foreground align-middle text-[13px]">
                    {formatDate(invoice.dueDate, fmt)}
                  </FxTableCell>

                  <FxTableCell className="align-middle">
                    <FxBadge variant={badge.variant}>{badge.label}</FxBadge>
                  </FxTableCell>

                  <FxTableCell className="text-foreground text-right align-middle text-[13.5px] font-semibold">
                    {formatCurrency(invoice.amount, invoice.currency, {
                      locale,
                    })}
                  </FxTableCell>

                  <FxTableCell className="text-right align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <PayNowButton invoice={invoice} />

                      {invoice.invoiceUrl ? (
                        <FxButton variant="secondary" size="xs" asChild>
                          <a
                            href={invoice.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                            <ArrowUpRight className="size-3.5" />
                          </a>
                        </FxButton>
                      ) : (
                        invoice.status === 'paid' && (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )
                      )}
                    </div>
                  </FxTableCell>
                </FxTableRow>
              )
            })}
          </TableBody>
        </FxTable>
      </div>
    </FxCard>
  )
}
