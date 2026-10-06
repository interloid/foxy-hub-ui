'use client'

import { FxButton } from '@/components/shared/fx-button'
import { useLocale } from '@/context/locale-provider'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { formatCurrency } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'
import type { InvoiceSummary } from './types'

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

export function InvoiceSummaryCards({
  summary,
  onBillNow,
}: {
  summary: InvoiceSummary
  onBillNow: () => void
}) {
  const locale = useLocale()
  const { currency } = useWorkspace()
  const money = (value: number) => formatCurrency(value, currency, { locale })

  const cards = [
    {
      id: 'paid',
      label: 'Paid this month',
      value: money(summary.paidThisMonth),
      valueClass: 'text-success',
      caption: `${summary.settledCount} settled all time`,
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      value: money(summary.outstanding),
      valueClass: 'text-foreground',
      caption: `${summary.outstandingCount} waiting on the client`,
    },
    {
      id: 'overdue',
      label: 'Overdue',
      value: money(summary.overdue),
      valueClass: 'text-destructive',
      caption: `${plural(summary.overdueCount, 'invoice', 'invoices')} past terms`,
    },
    {
      id: 'ready',
      label: 'Ready to bill',
      value: money(summary.readyToBill),
      valueClass: 'text-primary',
      caption: `${plural(summary.readyToBillProjects, 'project', 'projects')} with approved, unbilled hours`,
      highlight: true,
    },
    {
      id: 'draw',
      label: 'Left to draw',
      value: money(summary.leftToDraw),
      valueClass: 'text-foreground',
      caption: `${plural(summary.leftToDrawContracts, 'contract', 'contracts')} left to draw against`,
    },
  ]

  return (
    <section aria-label="Invoice summary">
      {/* All five in one row from lg up, as in the design; 2-3 per row on smaller screens. */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <li key={card.id}>
            <article
              className={cn(
                'bg-card border-border/80 flex h-full flex-col gap-1.5 rounded-2xl border p-4 shadow-xs',
                card.highlight && 'border-primary'
              )}
            >
              <p className="text-muted-foreground text-[12.5px] font-medium">
                {card.label}
              </p>
              <data
                value={card.value}
                className={cn(
                  'text-[24px] font-bold tracking-tight',
                  card.valueClass
                )}
              >
                {card.value}
              </data>
              <p className="text-muted-foreground text-xs">{card.caption}</p>
              {card.highlight && summary.readyToBill > 0 && (
                <FxButton
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={onBillNow}
                  className="bg-primary/10 text-primary hover:bg-primary/15 mt-1.5 w-fit gap-1 border-none"
                >
                  Bill it now
                  <ArrowRight className="size-3.5" />
                </FxButton>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
