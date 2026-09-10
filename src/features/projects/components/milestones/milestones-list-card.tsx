'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import type { MilestoneItem, MilestoneStatus } from '../../types'
import { CreateMilestoneSheet } from './create-milestone-sheet'

interface MilestonesListCardProps {
  milestones?: MilestoneItem[] | null
  isInOverview?: boolean
  projectId?: string
  isError?: boolean
}

const STATUS_CONFIG: Record<
  MilestoneStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  completed: {
    label: 'Done',
    dotClass: 'bg-success ring-2 ring-success/20',
    textClass: 'text-success font-semibold',
  },
  in_progress: {
    label: 'In progress',
    dotClass: 'bg-primary ring-2 ring-primary/20',
    textClass: 'text-primary font-semibold',
  },
  pending: {
    label: 'Pending',
    dotClass: 'bg-info ring-2 ring-info/20',
    textClass: 'text-info font-semibold',
  },
}

function formatDate(dateString?: string | null): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatHours(minutes: number = 0): string {
  const hours = minutes / 60
  return Number.isInteger(hours) ? hours.toString() : hours.toFixed(1)
}

export function MilestonesListCard({
  milestones = [],
  isInOverview = true,
  projectId = '',
  isError = false,
}: MilestonesListCardProps) {
  const safeMilestones = milestones ?? []
  const { userRole, orgId = '' } = useWorkspace()
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)

  return (
    <>
      <section
        aria-labelledby="milestones-card-heading"
        className="bg-card border-border overflow-hidden rounded-xl border shadow-xs"
      >
        {/* Header */}
        <header className="border-border/60 flex items-center justify-between border-b px-5 py-4">
          <h3
            id="milestones-card-heading"
            className={cn(
              'text-foreground font-semibold',
              isInOverview ? 'text-[14px]' : 'text-[15.5px]'
            )}
          >
            Milestones
          </h3>
          {!isInOverview &&
            !isError &&
            (userRole === 'admin' || userRole === 'owner') && (
              <div>
                <FxButton
                  variant="default"
                  size="default"
                  onClick={() => setIsCreateSheetOpen(true)}
                >
                  Create Milestone
                </FxButton>
              </div>
            )}
        </header>

        {/* List Content */}
        <div
          className={cn(
            'divide-border/40 divide-y px-5',
            isInOverview ? 'py-2' : 'py-1'
          )}
        >
          {isError ? (
            <div className="text-destructive flex items-center gap-2 py-4 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Failed to load milestones.</span>
            </div>
          ) : safeMilestones.length > 0 ? (
            safeMilestones.map((item) => {
              const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending
              const loggedHoursStr = formatHours(item.loggedMinutes)

              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between',
                    isInOverview ? 'py-3.5' : 'py-4'
                  )}
                >
                  {/* Status Dot & Main Info */}
                  <div
                    className={cn(
                      'flex items-start',
                      isInOverview ? 'gap-2.5' : 'gap-3.5'
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded-full border',
                        config.dotClass,
                        isInOverview ? 'mt-1.5 h-2.5 w-2.5' : 'mt-3.5 h-3 w-3'
                      )}
                      aria-hidden="true"
                    />
                    <div>
                      <p
                        className={cn(
                          'text-foreground leading-tight font-semibold',
                          isInOverview ? 'text-[13px]' : 'text-[14.5px]'
                        )}
                      >
                        {item.title}
                      </p>
                      <p
                        className={cn(
                          'text-subtle-foreground font-normal',
                          isInOverview ? 'mt-0.5 text-xs' : 'mt-1 text-[12.5px]'
                        )}
                      >
                        Due {formatDate(item.dueDate)} · {loggedHoursStr}h
                        logged
                      </p>
                    </div>
                  </div>

                  {/* Status Badge Label */}
                  {isInOverview ? (
                    <span className={cn(config.textClass, 'text-xs')}>
                      {config.label}
                    </span>
                  ) : (
                    <FxBadge
                      variant={
                        item.status === 'completed'
                          ? 'success'
                          : item.status === 'in_progress'
                            ? 'default'
                            : 'info'
                      }
                      size={isInOverview ? 'default' : 'sm'}
                      dot
                      className="text-[12px]"
                    >
                      {config.label}
                    </FxBadge>
                  )}
                </div>
              )
            })
          ) : (
            <p className="text-muted-foreground py-4 text-xs italic">
              No milestones configured for this project.
            </p>
          )}
        </div>
      </section>

      {/* Create Milestone Sheet */}
      <CreateMilestoneSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        projectId={projectId}
        orgId={orgId}
      />
    </>
  )
}
