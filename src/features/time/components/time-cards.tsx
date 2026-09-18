'use client'

import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { formatMinutesToLabel } from '@/lib/time'
import { cn } from '@/lib/utils'
import { startTransition, useState } from 'react'
import { toast } from 'sonner'
import { updateTimeEntriesStatus } from '../action'
import { MyTimeCardProps } from '../types'
import { ApprovalsView } from './approvals-view'
import { CapacityView } from './capacity-view'
import { WeeklyTimeEntriesTable } from './time-entry-table'

export function TimeCard({
  summary,
  entries,
  approvals,
  capacities,
  standardHoursPerDay,
  role,
  className,
}: MyTimeCardProps) {
  const cards = [
    {
      title: 'Logged this week',
      value: formatMinutesToLabel(summary.loggedThisWeekMinutes),
      colorClass: 'text-foreground',
    },
    {
      title: 'Approved',
      value: formatMinutesToLabel(summary.approvedMinutes),
      colorClass: 'text-success',
    },
    {
      title: 'Pending review',
      value: formatMinutesToLabel(summary.pendingReviewMinutes),
      colorClass: 'text-primary',
    },
    {
      title: 'Draft not submitted',
      value: formatMinutesToLabel(summary.draftMinutes),
      colorClass: 'text-subtle  -foreground',
    },
  ]

  const [submittingTarget, setSubmittingTarget] = useState<
    string | 'all' | null
  >(null)
  const { orgSlug } = useWorkspace()
  const handleSingleSubmit = (entryId: string) => {
    setSubmittingTarget(entryId)
    startTransition(async () => {
      try {
        const res = await updateTimeEntriesStatus(entryId, 'submitted', orgSlug)

        if (res.success) {
          toast.success('Time entry submitted for approval')
        } else {
          toast.error(res.error || 'Failed to submit entry. Please try again.')
        }
      } catch (error) {
        toast.error('An unexpected error occurred while submitting entry.')
        console.error('Failed to submit entry:', error)
      } finally {
        setSubmittingTarget(null)
      }
    })
  }

  const handleBatchSubmit = () => {
    const draftIds = entries
      .filter((e) => e.status === 'draft')
      .map((e) => e.id)

    if (draftIds.length === 0) return

    setSubmittingTarget('all')
    startTransition(async () => {
      try {
        const res = await updateTimeEntriesStatus(
          draftIds,
          'submitted',
          orgSlug
        )

        if (res.success) {
          toast.success(
            `Submitted ${draftIds.length} ${
              draftIds.length === 1 ? 'draft' : 'drafts'
            } for review`
          )
        } else {
          toast.error(res.error || 'Failed to submit drafts. Please try again.')
        }
      } catch (error) {
        toast.error('An unexpected error occurred while submitting drafts.')
        console.error('Failed to submit drafts:', error)
      } finally {
        setSubmittingTarget(null)
      }
    })
  }
  return (
    <div className={cn('w-full space-y-4', className)}>
      <Tabs defaultValue="my-time" className="w-full">
        <FxTabsListUnderline className="text-[13.5px]">
          <FxTabsTriggerUnderline value="my-time" className="cursor-pointer">
            My time
          </FxTabsTriggerUnderline>
          {(role === 'admin' || role === 'owner') && (
            <>
              <FxTabsTriggerUnderline
                value="approvals"
                className="cursor-pointer"
              >
                Approvals
                {summary?.pendingApprovalsCount &&
                summary.pendingApprovalsCount > 0 ? (
                  <span className="bg-primary/10 text-primary dark:bg-primary-subtle dark:text-primary ml-1.5 inline-flex h-5 items-center justify-center rounded-full px-2 text-xs font-bold">
                    {summary.pendingApprovalsCount}
                  </span>
                ) : null}
              </FxTabsTriggerUnderline>
              <FxTabsTriggerUnderline
                value="capacity"
                className="cursor-pointer"
              >
                Capacity
              </FxTabsTriggerUnderline>
            </>
          )}
        </FxTabsListUnderline>
        <TabsContent value="my-time" className="mt-4 space-y-4 outline-none">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card, idx) => (
              <div
                key={idx}
                className="bg-card text-card-foreground border-border/60 dark:border-border/40 flex flex-col justify-between rounded-xl border p-5 shadow-xs transition-shadow hover:shadow-sm"
              >
                <span className="text-subtle-foreground text-[12.5px] font-medium">
                  {card.title}
                </span>
                <span
                  className={cn(
                    'mt-2 text-[26px] font-bold tracking-tight',
                    card.colorClass
                  )}
                >
                  {card.value}
                </span>
              </div>
            ))}
          </div>
          <WeeklyTimeEntriesTable
            entries={entries}
            submittingId={submittingTarget}
            onSubmitSingleDraft={handleSingleSubmit}
            onSubmitAllDrafts={handleBatchSubmit}
          />
        </TabsContent>
        {(role === 'admin' || role === 'owner') && (
          <>
            <TabsContent value="approvals" className="mt-4 outline-none">
              <ApprovalsView approvals={approvals} />
            </TabsContent>
            <TabsContent value="capacity" className="mt-4 outline-none">
              <CapacityView
                capacities={capacities}
                standardHoursPerDay={standardHoursPerDay}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
