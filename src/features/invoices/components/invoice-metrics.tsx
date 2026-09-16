import { InvoiceMetrics } from '@/features/invoices/queries/get-invoice-metrics'

interface InvoiceMetricsProps {
  metrics: InvoiceMetrics
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function InvoiceMetricsCards({ metrics }: InvoiceMetricsProps) {
  const cards = [
    {
      id: 'paid',
      label: 'Paid this month',
      value: metrics.paidThisMonth,
      textClass: 'text-success',
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      value: metrics.outstanding,
      textClass: 'text-foreground',
    },
    {
      id: 'overdue',
      label: 'Overdue',
      value: metrics.overdue,
      textClass: 'text-destructive',
    },
  ]

  return (
    <section aria-label="Invoice summary" className="w-full">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <li key={card.id}>
            <article className="bg-card border-border/80 flex flex-col gap-2 rounded-2xl border p-5 shadow-xs">
              <p className="text-muted-foreground text-[12.5px] font-medium">
                {card.label}
              </p>
              <data
                value={card.value}
                className={`text-2xl text-[24px] font-bold tracking-tight ${card.textClass}`}
              >
                {formatCurrency(card.value)}
              </data>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
