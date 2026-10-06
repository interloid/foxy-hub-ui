'use client'

import { useFormatter, useLocale } from '@/context/locale-provider'
import { formatCurrency } from '@/lib/money'

import { buildInvoiceCopy } from '../../lib/invoice-copy'
import type { InvoiceDetail } from './types'

const SECTION_LABEL =
  'text-foreground text-[11px] font-bold tracking-wider uppercase'

/**
 * The client copy on screen. Renders from `buildInvoiceCopy`, the same source as the PDF
 * (`pdf/invoice-pdf.tsx`) - change the wording there, not here.
 */
export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const fmt = useFormatter()
  const locale = useLocale()
  const copy = buildInvoiceCopy(invoice, {
    money: (amount) => formatCurrency(amount, invoice.currency, { locale }),
    day: (iso) => fmt.date(iso, 'day'),
  })

  return (
    <article
      aria-label={`Invoice ${copy.number}, client copy`}
      className="bg-card text-foreground space-y-10 rounded-xl p-6 shadow-md sm:p-8"
    >
      {/* Agency + title */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs font-bold"
            >
              {copy.agency.initial}
            </span>
            <span className="text-[15px] font-bold">{copy.agency.name}</span>
          </div>
          {copy.agency.lines.length > 0 && (
            <address className="text-[12px] leading-relaxed not-italic">
              {copy.agency.lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-2xl font-bold tracking-wide">INVOICE</p>
          <p className="font-mono text-[13px] font-bold">{copy.number}</p>
        </div>
      </div>

      {/* Billed to / project / dates */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Billed to</p>
          <p className="text-[14px] font-semibold">{copy.billedTo.name}</p>
          <div className="text-[12.5px] leading-relaxed">
            {copy.billedTo.lines.map((line) => (
              <p key={line} className="break-all">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Project</p>
          <div className="text-[12.5px] leading-relaxed">
            {copy.project.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Dates</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-[12.5px] leading-relaxed">
            {copy.dates.map((d) => (
              <div key={d.label} className="contents">
                <dt>{d.label}</dt>
                <dd className={d.emphasis ? 'font-semibold' : undefined}>
                  {d.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-[12.5px]">
          <thead>
            <tr className={SECTION_LABEL}>
              <th className="pb-4 text-left font-bold">Description</th>
              <th className="w-20 pb-4 text-right font-bold">Qty</th>
              <th className="w-28 pb-4 text-right font-bold">Rate</th>
              <th className="w-28 pb-4 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {copy.lines.map((line) => (
              <tr key={line.id} className="align-top">
                <td className="py-2">
                  <p>{line.description}</p>
                  <p className="text-muted-foreground text-[11px] tracking-wide">
                    {line.typeLabel}
                  </p>
                </td>
                <td className="py-2 text-right font-mono">{line.qty}</td>
                <td className="py-2 text-right font-mono">{line.rate}</td>
                <td className="py-2 text-right font-mono font-bold">
                  {line.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <dl className="w-full max-w-75 space-y-3 text-[12.5px]">
          {copy.totals.map((t) => (
            <div key={t.label} className="flex justify-between px-3">
              <dt>{t.label}</dt>
              <dd className="font-mono">{t.value}</dd>
            </div>
          ))}
          <div className="bg-primary-subtle flex items-center justify-between rounded-lg px-3 py-3">
            <dt className="font-semibold">Amount due</dt>
            <dd className="text-primary font-mono text-[15px] font-bold">
              {copy.amountDue}
            </dd>
          </div>
        </dl>
      </div>

      {/* How to pay / terms */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <p className={SECTION_LABEL}>How to pay</p>
          <p className="text-[12px] leading-relaxed">
            {copy.howToPay.before}
            <span className="font-mono font-bold">
              {copy.howToPay.reference}
            </span>
            {copy.howToPay.after}
          </p>
        </div>
        <div className="space-y-2">
          <p className={SECTION_LABEL}>Terms</p>
          <p className="text-[12px] leading-relaxed">{copy.terms}</p>
        </div>
      </div>

      <p className="text-center text-[11.5px]">{copy.footer}</p>
    </article>
  )
}
