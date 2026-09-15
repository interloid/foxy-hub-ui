'use client'

import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { formatMinutesToLabel } from '@/features/dashboard/components/sheets/log-time-sheet/duration-input'
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
      colorClass: 'text-emerald-600 dark:text-emerald-500',
    },
    {
      title: 'Pending review',
      value: formatMinutesToLabel(summary.pendingReviewMinutes),
      colorClass: 'text-amber-600 dark:text-amber-500',
    },
    {
      title: 'Draft — not submitted',
      value: formatMinutesToLabel(summary.draftMinutes),
      colorClass: 'text-muted-foreground',
    },
  ]

  const [submittingTarget, setSubmittingTarget] = useState<
    string | 'all' | null
  >(null)

  const handleSingleSubmit = (entryId: string) => {
    setSubmittingTarget(entryId)
    startTransition(async () => {
      try {
        const res = await updateTimeEntriesStatus(entryId, 'submitted')

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
        const res = await updateTimeEntriesStatus(draftIds, 'submitted')

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

  const handleApproveEntry = async (entryId: string) => {
    try {
      const res = await updateTimeEntriesStatus(entryId, 'approved')

      if (res.success) {
        toast.success('Time entry approved')
      } else {
        toast.error(res.error || 'Failed to approve entry. Please try again.')
      }
    } catch (error) {
      toast.error('An unexpected error occurred while approving the entry.')
      console.error('Failed to approve entry:', error)
    }
  }

  const handleRejectEntry = async (entryId: string) => {
    try {
      const res = await updateTimeEntriesStatus(entryId, 'rejected')

      if (res.success) {
        toast.success('Time entry rejected')
      } else {
        toast.error(res.error || 'Failed to reject entry. Please try again.')
      }
    } catch (error) {
      toast.error('An unexpected error occurred while rejecting the entry.')
      console.error('Failed to reject entry:', error)
    }
  }

  const handleApproveAll = async (userId: string) => {
    const userGroup = approvals.find((g) => g.userId === userId)
    if (!userGroup) return

    const entryIds = userGroup.entries.map((e) => e.id)
    if (entryIds.length === 0) return

    try {
      const res = await updateTimeEntriesStatus(entryIds, 'approved')

      if (res.success) {
        toast.success(
          `Approved ${entryIds.length} ${
            entryIds.length === 1 ? 'entry' : 'entries'
          } for ${userGroup.fullName}`
        )
      } else {
        toast.error(res.error || 'Failed to approve entries. Please try again.')
      }
    } catch (error) {
      toast.error('An unexpected error occurred while approving entries.')
      console.error('Failed to approve user entries:', error)
    }
  }
  return (
    <div className={cn('w-full space-y-4', className)}>
      <Tabs defaultValue="my-time" className="w-full">
        <FxTabsListUnderline>
          <FxTabsTriggerUnderline value="my-time">
            My time
          </FxTabsTriggerUnderline>
          <FxTabsTriggerUnderline value="approvals">
            Approvals
            {summary?.pendingApprovalsCount &&
            summary.pendingApprovalsCount > 0 ? (
              <span className="bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary ml-1.5 inline-flex h-5 items-center justify-center rounded-full px-2 text-xs font-bold">
                {summary.pendingApprovalsCount}
              </span>
            ) : null}
          </FxTabsTriggerUnderline>
          <FxTabsTriggerUnderline value="capacity">
            Capacity
          </FxTabsTriggerUnderline>
        </FxTabsListUnderline>

        <TabsContent value="my-time" className="mt-4 space-y-4 outline-none">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, idx) => (
              <div
                key={idx}
                className="bg-card text-card-foreground border-border/60 dark:border-border/40 flex flex-col justify-between rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-sm"
              >
                <span className="text-muted-foreground text-xs font-medium">
                  {card.title}
                </span>
                <span
                  className={cn(
                    'mt-2 text-2xl font-bold tracking-tight',
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

        <TabsContent value="approvals" className="mt-4 outline-none">
          <ApprovalsView
            approvals={approvals}
            onApproveEntry={handleApproveEntry}
            onApproveAll={handleApproveAll}
            onRejectEntry={handleRejectEntry}
          />
        </TabsContent>

        <TabsContent value="capacity" className="mt-4 outline-none">
          <CapacityView
            capacities={capacities}
            standardHoursPerDay={standardHoursPerDay}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
