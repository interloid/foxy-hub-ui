import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { PendingApproval } from '@/features/dashboard/types'
import { CheckCircle2 } from 'lucide-react'

interface PendingApprovalsProps {
  approvals: PendingApproval[]
  onViewAllClick?: () => void
  onApproveClick?: (id: string) => void
}

export function PendingApprovals({
  approvals = [],
  onViewAllClick,
  onApproveClick,
}: PendingApprovalsProps) {
  const hasApprovals = approvals && approvals.length > 0

  return (
    <FxCard className="overflow-hidden">
      <FxCardContent className="p-0">
        {/* Card Header */}
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h3 className="text-foreground text-[14px] font-semibold">
              Pending approvals
            </h3>
            <FxBadge
              shape="pill"
              size="count"
              className={
                hasApprovals
                  ? 'bg-warning-subtle text-warning font-sans text-[11px]'
                  : 'bg-muted text-muted-foreground font-sans text-[11px]'
              }
            >
              {hasApprovals ? `${approvals.length} waiting` : '0 waiting'}
            </FxBadge>
          </div>

          {hasApprovals && onViewAllClick && (
            <FxButton
              variant="ghost"
              size="xs"
              onClick={onViewAllClick}
              className="text-muted-foreground hover:text-foreground h-auto bg-transparent p-0 text-[12.5px] hover:bg-transparent"
            >
              View all
            </FxButton>
          )}
        </div>

        {/* List of Approvals OR Empty State */}
        {hasApprovals ? (
          <div className="divide-border divide-y">
            {approvals.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-5 py-3.5 transition-colors"
              >
                <div className="flex min-w-0 items-center gap-3.5 pr-2">
                  {/* File Type Icon Badge */}
                  <div className="bg-warning-subtle text-primary-accent flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border text-xs font-bold tracking-wider uppercase">
                    {item.ext}
                  </div>

                  {/* File Info */}
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13.5px] font-semibold">
                      {item.name}
                    </p>
                    <p className="text-muted-foreground text-[12px]">
                      <span className="block md:inline">{item.project} ·</span>{' '}
                      <span className="block md:inline">{item.client}</span>
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <FxButton
                  size="default"
                  // onClick={() => onApproveClick?.(item.id)}
                  className="border-border bg-muted text-foreground hover:border-border-strong hover:bg-muted shrink-0 rounded-lg px-4 text-[12.5px]"
                >
                  Approve
                </FxButton>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
            <div className="bg-muted text-muted-foreground mb-2.5 flex h-10 w-10 items-center justify-center rounded-full">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="text-foreground text-[13.5px] font-medium">
              All caught up!
            </p>
            <p className="text-muted-foreground mt-0.5 text-[12px]">
              There are no pending approvals at the moment.
            </p>
          </div>
        )}
      </FxCardContent>
    </FxCard>
  )
}
