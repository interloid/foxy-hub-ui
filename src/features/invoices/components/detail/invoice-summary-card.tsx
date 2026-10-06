'use client'

import Link from 'next/link'

import { FxBadge } from '@/components/shared/fx-badge'
import { useFormatter, useLocale } from '@/context/locale-provider'
import { formatCurrency } from '@/lib/money'
import { cn } from '@/lib/utils'

import { daysBetween } from '../../lib/dates'
import { KIND_LABEL, STATUS_BADGE } from '../list/invoice-list'
import type { InvoiceDetail } from './types'

/** The red / green / grey line under the dates, same rules as the list's Due column. */
function dueCaption(
  invoice: InvoiceDetail,
  today: string,
  fmt: ReturnType<typeof useFormatter>
) {
  if (invoice.status === 'paid' && invoice.paidAt) {
    return {
      text: `Paid ${fmt.date(invoice.paidAt, 'day')}`,
      className: 'text-success',
    }
  }
  if (
    !invoice.dueDate ||
    invoice.status === 'draft' ||
    invoice.status === 'cancelled'
  ) {
    return null
  }
  const days = daysBetween(today, invoice.dueDate)
  if (invoice.status === 'overdue' || days < 0) {
    return { text: `${Math.abs(days)}d overdue`, className: 'text-destructive' }
  }
  return {
    text: days === 0 ? 'Due today' : `Due in ${days}d`,
    className: 'text-muted-foreground',
  }
}

export function InvoiceSummaryCard({
  invoice,
  orgSlug,
  today,
}: {
  invoice: InvoiceDetail
  orgSlug: string
  today: string
}) {
  const fmt = useFormatter()
  const locale = useLocale()
  const badge = STATUS_BADGE[invoice.status]
  const caption = dueCaption(invoice, today, fmt)

  return (
    <header className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-foreground text-xl font-bold">
            {formatCurrency(invoice.total, invoice.currency, { locale })}
          </p>
          <FxBadge variant={badge.variant} size="sm" dot>
            {badge.label}
          </FxBadge>
          <FxBadge variant="secondary" size="sm">
            {KIND_LABEL[invoice.kind]}
          </FxBadge>
        </div>
        <p className="text-muted-foreground text-[13px]">
          {invoice.client.name}
          {invoice.client.contactName && ` · ${invoice.client.contactName}`}
        </p>
        <Link
          href={`/${orgSlug}/projects/${invoice.project.id}`}
          className="text-primary text-[13px] font-medium underline underline-offset-2"
        >
          {invoice.project.name}
        </Link>
      </div>

      <div className="text-muted-foreground space-y-0.5 text-[12.5px] sm:text-right">
        <p>Issued {fmt.date(invoice.issuedOn, 'day')}</p>
        {invoice.dueDate && (
          <p>
            Due {fmt.date(invoice.dueDate, 'day')} · Net{' '}
            {invoice.paymentTermsDays}
          </p>
        )}
        {caption && (
          <p
            className={cn('pt-1 text-[13px] font-semibold', caption.className)}
          >
            {caption.text}
          </p>
        )}
      </div>
    </header>
  )
}
