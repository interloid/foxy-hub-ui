'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxTable, FxTableCell, FxTableRow } from '@/components/shared/fx-table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TableBody } from '@/components/ui/table'
import { formatMinutesToLabel } from '@/features/dashboard/components/sheets/log-time-sheet/duration-input'
import { cn } from '@/lib/utils'
import { Check, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { updateTimeEntriesStatus } from '../action'
import { ApprovalsViewProps } from '../types'

function formatDateLabel(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function getInitials(name: string): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function ApprovalsView({
  approvals,
  onApproveAll,
  onApproveEntry,
  onRejectEntry,
  className,
}: ApprovalsViewProps) {
  const [activeTarget, setActiveTarget] = useState<string | null>(null)

  // Track entries that have been approved/rejected and should disappear immediately
  const [removedEntryIds, setRemovedEntryIds] = useState<Set<string>>(new Set())

  // Filter out users who have no remaining active entries
  const visibleApprovals = approvals
    .map((group) => {
      const activeEntries = group.entries.filter(
        (entry) => !removedEntryIds.has(entry.id)
      )
      return {
        ...group,
        entries: activeEntries,
      }
    })
    .filter((group) => group.entries.length > 0)

  if (visibleApprovals.length === 0) {
    return (
      <div className="bg-card border-border/70 text-muted-foreground rounded-xl border p-8 text-center text-sm shadow-xs">
        No pending approval requests for this week.
      </div>
    )
  }

  // Handle Approve All for a User Group
  const handleApproveWeek = async (userId: string, entryIds: string[]) => {
    if (entryIds.length === 0) return

    setActiveTarget(`user-${userId}`)
    try {
      const res = await updateTimeEntriesStatus(entryIds, 'approved')
      if (res.success) {
        // Immediately mark all entries in this group as removed
        setRemovedEntryIds((prev) => {
          const next = new Set(prev)
          entryIds.forEach((id) => next.add(id))
          return next
        })
        await onApproveAll?.(userId)
      } else {
        console.error('Failed to approve week entries:', res.error)
      }
    } catch (err) {
      console.error('Error approving week entries:', err)
    } finally {
      setActiveTarget(null)
    }
  }

  const handleApproveSingle = async (entryId: string) => {
    setActiveTarget(`entry-approve-${entryId}`)
    try {
      const res = await updateTimeEntriesStatus(entryId, 'approved')
      if (res.success) {
        // Immediately hide single entry
        setRemovedEntryIds((prev) => new Set(prev).add(entryId))
        await onApproveEntry?.(entryId)
      } else {
        console.error('Failed to approve entry:', res.error)
      }
    } catch (err) {
      console.error('Error approving entry:', err)
    } finally {
      setActiveTarget(null)
    }
  }

  const handleRejectSingle = async (entryId: string) => {
    setActiveTarget(`entry-reject-${entryId}`)
    try {
      const res = await updateTimeEntriesStatus(entryId, 'rejected')
      if (res.success) {
        // Immediately hide single entry
        setRemovedEntryIds((prev) => new Set(prev).add(entryId))
        await onRejectEntry?.(entryId)
      } else {
        console.error('Failed to reject entry:', res.error)
      }
    } catch (err) {
      console.error('Error rejecting entry:', err)
    } finally {
      setActiveTarget(null)
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {visibleApprovals.map((userGroup) => {
        const isUserGroupPending = activeTarget === `user-${userGroup.userId}`
        const groupEntryIds = userGroup.entries.map((e) => e.id)

        return (
          <div
            key={userGroup.userId}
            className="bg-card border-border/70 overflow-hidden rounded-xl border shadow-xs"
          >
            <div className="border-border/60 flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {userGroup.avatarUrl && (
                    <AvatarImage
                      src={userGroup.avatarUrl}
                      alt={userGroup.fullName}
                    />
                  )}
                  <AvatarFallback className="bg-emerald-600 text-xs font-semibold text-white dark:bg-emerald-700">
                    {getInitials(userGroup.fullName)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex flex-col">
                  <span className="text-foreground text-base font-semibold">
                    {userGroup.fullName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {userGroup.entries.length}{' '}
                    {userGroup.entries.length === 1 ? 'entry' : 'entries'} ·{' '}
                    {formatMinutesToLabel(
                      userGroup.entries.reduce(
                        (acc, cur) => acc + (cur.durationMinutes || 0),
                        0
                      )
                    )}{' '}
                    awaiting review
                  </span>
                </div>
              </div>

              <FxButton
                size="sm"
                variant="default"
                disabled={activeTarget !== null}
                onClick={() =>
                  handleApproveWeek(userGroup.userId, groupEntryIds)
                }
                className="bg-success text-brand-white gap-1.5 font-medium shadow-xs hover:bg-emerald-700 disabled:opacity-50"
              >
                {isUserGroupPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4 stroke-[2.5]" />
                )}
                Approve all
              </FxButton>
            </div>

            <FxTable>
              <TableBody>
                {userGroup.entries.map((entry) => {
                  const isApproving =
                    activeTarget === `entry-approve-${entry.id}`
                  const isRejecting =
                    activeTarget === `entry-reject-${entry.id}`

                  return (
                    <FxTableRow
                      key={entry.id}
                      className="hover:bg-muted/10 border-border/40"
                    >
                      <FxTableCell className="text-muted-foreground w-25 text-center font-medium">
                        {formatDateLabel(entry.workDate)}
                      </FxTableCell>

                      <FxTableCell className="w-55">
                        <div className="flex flex-col">
                          <span className="text-foreground font-semibold">
                            {entry.projectName}
                          </span>
                        </div>
                      </FxTableCell>

                      <FxTableCell className="w-[40%]">
                        <span
                          className="text-foreground/90 block truncate"
                          title={entry.description}
                        >
                          {entry.description}
                        </span>
                      </FxTableCell>

                      <FxTableCell className="w-25 text-right font-mono font-semibold tabular-nums">
                        {formatMinutesToLabel(entry.durationMinutes)}
                      </FxTableCell>

                      <FxTableCell className="w-45 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <FxButton
                            variant="outline"
                            size="xs"
                            disabled={activeTarget !== null}
                            onClick={() => handleApproveSingle(entry.id)}
                            className="border-success bg-success/80 text-brand-white hover:bg-success h-8 font-semibold disabled:opacity-50"
                          >
                            {isApproving ? (
                              <Loader2 className="mr-1 size-3.5 animate-spin" />
                            ) : (
                              <Check className="mr-1 size-3.5 stroke-[2.5]" />
                            )}
                            Approve
                          </FxButton>

                          <FxButton
                            variant="outline"
                            size="xs"
                            disabled={activeTarget !== null}
                            onClick={() => handleRejectSingle(entry.id)}
                            className="border-border text-foreground/80 hover:bg-accent h-8 font-medium disabled:opacity-50"
                          >
                            {isRejecting ? (
                              <Loader2 className="mr-1 size-3.5 animate-spin" />
                            ) : (
                              <X className="mr-1 size-3.5 stroke-2" />
                            )}
                            Reject
                          </FxButton>
                        </div>
                      </FxTableCell>
                    </FxTableRow>
                  )
                })}
              </TableBody>
            </FxTable>
          </div>
        )
      })}
    </div>
  )
}
