'use client'

import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import { HoursSummaryData } from '../../types'

interface HoursSummaryCardsProps {
  summary?: HoursSummaryData | null
  className?: string
  isError?: boolean
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
  summary = { loggedMinutes: 0, approvedMinutes: 0, pendingMinutes: 0 },
  className,
  isError = false,
}: HoursSummaryCardsProps) {
  const safeSummary = summary ?? {
    loggedMinutes: 0,
    approvedMinutes: 0,
    pendingMinutes: 0,
  }

  const cards = [
    {
      id: 'logged',
      label: 'Logged',
      value: formatHours(safeSummary.loggedMinutes),
      valueColorClass: 'text-foreground',
    },
    {
      id: 'approved',
      label: 'Approved',
      value: formatHours(safeSummary.approvedMinutes),
      valueColorClass: 'text-success',
    },
    {
      id: 'pending',
      label: 'Pending review',
      value: formatHours(safeSummary.pendingMinutes),
      valueColorClass: 'text-warning',
    },
  ]

  if (isError) {
    return (
      <div
        className={cn(
          'bg-card border-border text-destructive flex items-center gap-2 rounded-2xl border p-5 text-xs font-medium shadow-xs',
          className
        )}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Failed to load monthly hours summary.</span>
      </div>
    )
  }

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
            <h4 className="text-muted-foreground text-[12.5px] tracking-wide">
              {card.label}
            </h4>
          </header>

          <p
            className={cn(
              'mt-3 text-[24px] font-bold tracking-tight',
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
