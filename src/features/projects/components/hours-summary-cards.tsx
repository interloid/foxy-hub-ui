'use client'

import { cn } from '@/lib/utils'
import { HoursSummaryData } from '../types'

interface HoursSummaryCardsProps {
  summary: HoursSummaryData
  className?: string
}

function formatHours(minutes: number = 0): string {
  const hours = minutes / 60
  // Displays clean integers (8h) or 1 decimal place (6.5h)
  const formatted = Number.isInteger(hours)
    ? hours.toString()
    : hours.toFixed(1)
  return `${formatted}h`
}

export function HoursSummaryCards({
  summary,
  className,
}: HoursSummaryCardsProps) {
  const cards = [
    {
      id: 'logged',
      label: 'Logged',
      value: formatHours(summary.loggedMinutes),
      valueColorClass: 'text-foreground',
    },
    {
      id: 'approved',
      label: 'Approved',
      value: formatHours(summary.approvedMinutes),
      valueColorClass: 'text-success', // or 'text-success'
    },
    {
      id: 'pending',
      label: 'Pending review',
      value: formatHours(summary.pendingMinutes),
      valueColorClass: 'text-warning', // or 'text-warning'
    },
  ]

  return (
    <section
      aria-label="Monthly project hours overview"
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3',
        className
      )}
    >
      {cards.map((card) => (
        <article
          key={card.id}
          className="bg-card border-border flex flex-col justify-between rounded-2xl border p-5 shadow-xs transition-colors"
        >
          <header>
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide">
              {card.label}
            </h4>
          </header>

          <p
            className={cn(
              'mt-3 text-2xl font-bold tracking-tight',
              card.valueColorClass
            )}
          >
            {card.value}
          </p>
        </article>
      ))}
    </section>
  )
}
