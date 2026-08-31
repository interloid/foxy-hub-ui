import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { FxProgress } from '@/components/shared/fx-progress'
import { ActiveProject } from '@/features/dashboard/types'
import { FolderKanban } from 'lucide-react'

interface ActiveProjectsProps {
  projects: ActiveProject[]
  onOpenWorkspaceClick?: () => void
}

type BadgeVariant =
  'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'

const statusBadgeVariantMap: Record<ActiveProject['status'], BadgeVariant> = {
  completed: 'success',
  'in-progress': 'default',
  'pending-approval': 'warning',
  pending: 'warning',
  'on-hold': 'destructive',
  cancelled: 'destructive',
  draft: 'secondary',
}

const statusDisplayLabel: Record<ActiveProject['status'], string> = {
  completed: 'Completed',
  'in-progress': 'Active',
  'pending-approval': 'In review',
  pending: 'Pending',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
  draft: 'Draft',
}

export function ActiveProjects({
  projects = [],
  onOpenWorkspaceClick,
}: ActiveProjectsProps) {
  const hasProjects = projects && projects.length > 0

  return (
    <FxCard className="overflow-hidden">
      <FxCardContent className="p-0">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-4 py-3.5 sm:px-5 sm:py-4">
          <h3 className="text-foreground text-[14px] font-semibold">
            Active projects
          </h3>
          {onOpenWorkspaceClick && (
            <FxButton
              variant="ghost"
              size="xs"
              onClick={onOpenWorkspaceClick}
              className="text-muted-foreground hover:text-foreground h-auto bg-transparent p-0 text-[12.5px] hover:bg-transparent"
            >
              Open workspace
            </FxButton>
          )}
        </div>

        {/* Grid Container OR Empty State */}
        {hasProjects ? (
          <div className="w-full">
            {/* Grid Header */}
            <div className="border-border text-subtle-foreground grid grid-cols-[24%_26%_18%_32%] items-center border-b px-3 py-3 text-[10px] font-semibold tracking-wider uppercase sm:grid-cols-4 sm:px-5 sm:text-[11px]">
              <div className="pr-1 sm:pr-3">PROJECT</div>
              <div className="px-1 sm:px-3">STATUS</div>
              <div className="px-1 sm:px-3">PROGRESS</div>
              <div className="pr-0 pl-1 text-right sm:pl-3">VALUE</div>
            </div>

            {/* Grid Body */}
            <div className="divide-border divide-y">
              {projects.map((p) => {
                const variant = statusBadgeVariantMap[p.status] ?? 'secondary'
                const label = statusDisplayLabel[p.status] ?? p.status
                const progress = Number.isNaN(Number(p.progress))
                  ? 0
                  : Number(p.progress)

                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-[22%_28%_18%_32%] items-center px-3 py-3 transition-colors sm:grid-cols-4 sm:px-5"
                  >
                    {/* Project & Client */}
                    <div className="min-w-0 pr-1 sm:pr-3">
                      <div className="text-foreground truncate text-[12.5px] font-semibold sm:text-[13.5px]">
                        {p.name}
                      </div>
                      <div className="text-subtle-foreground text-[12px]">
                        {p.client}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="min-w-0 px-1 sm:px-3">
                      <FxBadge
                        variant={variant}
                        shape="pill"
                        dot
                        size="sm"
                        className="max-w-full sm:text-[12px]"
                      >
                        <span className="truncate text-[12px]">{label}</span>
                      </FxBadge>
                    </div>

                    {/* Progress Bar & Percentage */}
                    <div className="px-1 sm:px-3">
                      <div className="flex items-center gap-1 sm:gap-2.5">
                        <FxProgress
                          value={progress}
                          size="default"
                          variant="default"
                          className="hidden w-20 sm:flex"
                        />
                        <span className="text-primary text-[8px] sm:hidden">
                          ●
                        </span>
                        <span className="text-muted-foreground font-medium sm:text-[12px]">
                          {progress}%
                        </span>
                      </div>
                    </div>

                    {/* Value */}
                    <div className="text-foreground pr-0 pl-1 text-right font-mono text-[13px] font-medium sm:pl-3 sm:text-[13px]">
                      {p.value}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
            <div className="bg-muted text-muted-foreground mb-2.5 flex h-10 w-10 items-center justify-center rounded-full">
              <FolderKanban className="size-5" />
            </div>
            <p className="text-foreground text-[13.5px] font-medium">
              No active projects
            </p>
            <p className="text-muted-foreground mt-0.5 text-[12px]">
              Active projects and their current progress will appear here.
            </p>
          </div>
        )}
      </FxCardContent>
    </FxCard>
  )
}
