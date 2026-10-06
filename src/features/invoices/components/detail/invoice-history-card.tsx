'use client'

import { AlertTriangle, Bell, Check, Circle, Plus, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useFormatter } from '@/context/locale-provider'
import { cn } from '@/lib/utils'

import type { InvoiceHistoryItem, InvoiceHistoryKind } from './types'

const KIND_STYLE: Record<
  InvoiceHistoryKind,
  { icon: LucideIcon; className: string }
> = {
  overdue: {
    icon: AlertTriangle,
    className: 'bg-destructive-subtle text-destructive',
  },
  reminded: { icon: Bell, className: 'bg-warning-subtle text-warning' },
  sent: { icon: Send, className: 'bg-info-subtle text-info' },
  drafted: { icon: Plus, className: 'bg-muted text-muted-foreground' },
  paid: { icon: Check, className: 'bg-success-subtle text-success' },
  event: { icon: Circle, className: 'bg-muted text-muted-foreground' },
}

export function InvoiceHistoryCard({
  history,
}: {
  history: InvoiceHistoryItem[]
}) {
  const fmt = useFormatter()

  return (
    <section
      aria-labelledby="invoice-history-heading"
      className="bg-card border-border rounded-xl border p-5 shadow-xs"
    >
      <h2
        id="invoice-history-heading"
        className="text-foreground text-[14px] font-semibold"
      >
        History
      </h2>
      {history.length === 0 ? (
        <p className="text-muted-foreground pt-3 text-[12.5px]">
          Nothing has happened yet.
        </p>
      ) : (
        <ol className="space-y-3.5 pt-3">
          {history.map((item) => {
            const { icon: Icon, className } = KIND_STYLE[item.kind]
            return (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-md',
                    className
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-foreground text-[13px] leading-snug">
                    {item.text}
                  </p>
                  {item.at && (
                    <time
                      dateTime={item.at}
                      className="text-subtle-foreground text-[11.5px]"
                    >
                      {fmt.date(item.at, 'day')}
                    </time>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
