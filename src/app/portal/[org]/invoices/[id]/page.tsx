import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, CheckCircle2, Clock, XCircle } from 'lucide-react'

import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { getPortalInvoice } from '@/features/portal/queries'
import { getFormatter } from '@/lib/dal'

export const metadata: Metadata = {
  title: 'Payment | Foxy Hub',
  robots: { index: false, follow: false },
}

interface PaymentResultPageProps {
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ payment?: string }>
}

export default async function PaymentResultPage({
  params,
  searchParams,
}: PaymentResultPageProps) {
  const fmt = await getFormatter()
  const { org, id } = await params
  const { payment } = await searchParams

  const invoice = await getPortalInvoice(id)
  if (!invoice) notFound()

  const cancelled = payment === 'cancelled'
  const settled = invoice.status === 'paid'
  const pending = payment === 'success' && !settled

  const tone = cancelled
    ? {
        icon: XCircle,
        wrap: 'bg-muted text-muted-foreground',
        title: 'Payment cancelled',
        body: 'Nothing was charged. You can pay this invoice whenever you are ready.',
      }
    : settled
      ? {
          icon: CheckCircle2,
          wrap: 'bg-success/15 text-success',
          title: 'Payment received',
          body: 'Thank you — this invoice is settled. A receipt is available below.',
        }
      : pending
        ? {
            icon: Clock,
            wrap: 'bg-warning/15 text-warning',
            title: 'Payment is being confirmed',
            body: 'Your card went through. This page will show the invoice as paid once the confirmation lands — usually within a few seconds.',
          }
        : {
            icon: Clock,
            wrap: 'bg-muted text-muted-foreground',
            title: 'Invoice not yet paid',
            body: 'This invoice is still outstanding.',
          }

  const Icon = tone.icon

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <FxCard className="mx-auto w-full max-w-160">
        <FxCardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className={`flex size-12 items-center justify-center rounded-full ${tone.wrap}`}
            >
              <Icon className="size-6" />
            </div>
            <h1 className="text-foreground text-[20px] font-semibold">
              {tone.title}
            </h1>
            <p className="text-muted-foreground max-w-100 text-sm">
              {tone.body}
            </p>
          </div>

          <dl className="border-border divide-border/60 divide-y border-y">
            <div className="flex items-center justify-between py-3">
              <dt className="text-muted-foreground text-[13px]">Invoice</dt>
              <dd className="text-foreground text-[13.5px] font-semibold">
                {invoice.number}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-muted-foreground text-[13px]">Amount</dt>
              <dd className="text-foreground text-[15px] font-semibold">
                {fmt.currency(invoice.amount, invoice.currency)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {invoice.invoiceUrl && (
              <FxButton variant="secondary" asChild>
                <a
                  href={invoice.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View receipt
                  <ArrowUpRight className="size-4" />
                </a>
              </FxButton>
            )}

            <FxButton asChild>
              <Link href={`/portal/${org}`}>Back to dashboard</Link>
            </FxButton>
          </div>
        </FxCardContent>
      </FxCard>
    </div>
  )
}
