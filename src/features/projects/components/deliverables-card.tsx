import { FxBadge } from '@/components/shared/fx-badge' // Adjust import path if needed
import { Check, Clock, Hourglass, XCircle } from 'lucide-react'
import type { DeliverableItem, DeliveryStatus } from '../types'

interface DeliverablesCardProps {
  deliverables: DeliverableItem[]
}

export function DeliverablesCard({ deliverables }: DeliverablesCardProps) {
  return (
    <section
      aria-labelledby="deliverables-heading"
      className="bg-card border-border rounded-xl border shadow-xs"
    >
      <header className="border-border border-b px-5 py-4">
        <h2
          id="deliverables-heading"
          className="text-foreground text-[14px] font-bold"
        >
          Deliverables
        </h2>
      </header>

      {deliverables.length === 0 ? (
        <div className="text-muted-foreground p-6 text-center text-xs">
          No deliverables uploaded yet.
        </div>
      ) : (
        <ul className="divide-border divide-y">
          {deliverables.map((item) => (
            <li
              key={item.id}
              className="ds:p-5 flex items-center justify-between gap-4 p-4"
            >
              {/* File Badge & Info */}
              <div className="flex min-w-0 items-center gap-3.5">
                <div
                  aria-hidden="true"
                  className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase select-none"
                >
                  {item.fileType}
                </div>

                <div className="min-w-0 space-y-0.5">
                  <h3 className="text-foreground truncate text-[13.5px] font-semibold">
                    {item.title}
                  </h3>
                  <p className="text-subtle-foreground text-[12px] wrap-break-word">
                    {item.fileSize} · {item.authorName} ·{' '}
                    <time dateTime={item.createdAt}>
                      {formatRelativeTime(item.createdAt)}
                    </time>
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="shrink-0">
                <StatusBadge status={item.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  switch (status) {
    case 'approved':
      return (
        <FxBadge variant="success" shape="pill">
          <Check className="compact:inline-block hidden h-3.5 w-3.5 stroke-[2.5]" />
          Approved
        </FxBadge>
      )

    case 'submitted':
      return (
        <FxBadge variant="warning" shape="pill">
          <Hourglass className="compact:inline-block hidden h-3.5 w-3.5" />
          Awaiting client
        </FxBadge>
      )

    case 'rejected':
      return (
        <FxBadge variant="destructive" shape="pill">
          <XCircle className="compact:inline-block hidden h-3.5 w-3.5" />
          Rejected
        </FxBadge>
      )

    case 'pending':
    default:
      return (
        <FxBadge variant="secondary" shape="pill">
          <Clock className="compact:inline-block hidden h-3.5 w-3.5" />
          Pending
        </FxBadge>
      )
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 3600) {
    const mins = Math.max(1, Math.floor(diffInSeconds / 60))
    return `${mins}m ago`
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}h ago`
  }
  if (diffInSeconds < 172800) {
    return '1d ago'
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
