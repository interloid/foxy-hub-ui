'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
  FxTableScroll,
} from '@/components/shared/fx-table'
import { TimeEntryStatus } from '../types'

export interface TimeEntryItem {
  id: string
  workDate: string
  authorName: string
  authorInitials: string
  avatarColorClass?: string
  milestoneTitle?: string | null
  description: string
  durationMinutes: number
  status: TimeEntryStatus
}

interface TimeEntriesTableCardProps {
  entries?: TimeEntryItem[] | null
}

const STATUS_BADGE_CONFIG: Record<
  TimeEntryStatus,
  {
    label: string
    variant: 'success' | 'secondary' | 'warning' | 'destructive'
  }
> = {
  approved: { label: 'Approved', variant: 'success' },
  submitted: { label: 'Pending', variant: 'warning' },
  draft: { label: 'Draft', variant: 'secondary' },
  rejected: { label: 'Rejected', variant: 'destructive' },
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60

  if (hours > 0 && remainingMins > 0) {
    return `${hours}h ${remainingMins}m`
  }
  if (hours > 0) {
    return `${hours}h`
  }
  return `${remainingMins}m`
}

export function TimeEntriesTableCard({
  entries = [],
}: TimeEntriesTableCardProps) {
  const safeEntries = (entries ?? []).slice(0, 5)

  return (
    <section
      aria-labelledby="time-entries-heading"
      className="bg-card border-border overflow-hidden rounded-xl border shadow-xs"
    >
      {/* Header */}
      <header className="border-border/60 border-b px-5 py-4">
        <h3
          id="time-entries-heading"
          className="text-foreground text-[14px] font-bold"
        >
          Time entries on this project
        </h3>
      </header>

      {/* Table Section */}
      <FxTableScroll>
        <FxTable>
          <FxTableHeader>
            <FxTableRow className="hover:bg-transparent">
              <FxTableHead className="w-25">DATE</FxTableHead>
              <FxTableHead className="w-45">TEAM</FxTableHead>
              <FxTableHead className="w-40">MILESTONE</FxTableHead>
              <FxTableHead>DESCRIPTION</FxTableHead>
              <FxTableHead className="w-27.5 text-right">HOURS</FxTableHead>
              <FxTableHead className="w-27.5 text-right">STATUS</FxTableHead>
            </FxTableRow>
          </FxTableHeader>
          <tbody>
            {safeEntries.length > 0 ? (
              safeEntries.map((entry) => {
                const statusConfig =
                  STATUS_BADGE_CONFIG[entry.status] || STATUS_BADGE_CONFIG.draft

                return (
                  <FxTableRow key={entry.id}>
                    {/* Date */}
                    <FxTableCell className="text-muted-foreground text-xs font-normal">
                      {formatDate(entry.workDate)}
                    </FxTableCell>

                    {/* Team Member */}
                    <FxTableCell>
                      <div className="flex items-center gap-2">
                        <div
                          aria-hidden="true"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                            entry.avatarColorClass || 'bg-emerald-600'
                          }`}
                        >
                          {entry.authorInitials}
                        </div>
                        <span className="text-foreground text-xs font-medium">
                          {entry.authorName}
                        </span>
                      </div>
                    </FxTableCell>

                    {/* Milestone */}
                    <FxTableCell className="text-subtle-foreground text-xs font-normal">
                      {entry.milestoneTitle || '—'}
                    </FxTableCell>

                    {/* Description */}
                    <FxTableCell className="text-foreground max-w-[320px] truncate text-xs font-normal">
                      {entry.description}
                    </FxTableCell>

                    {/* Hours */}
                    <FxTableCell numeric className="text-xs">
                      {formatDuration(entry.durationMinutes)}
                    </FxTableCell>

                    {/* Status */}
                    <FxTableCell className="text-right">
                      <FxBadge variant={statusConfig.variant} size="sm" dot>
                        {statusConfig.label}
                      </FxBadge>
                    </FxTableCell>
                  </FxTableRow>
                )
              })
            ) : (
              <FxTableRow className="hover:bg-transparent">
                <FxTableCell
                  colSpan={6}
                  className="text-muted-foreground py-6 text-center text-xs italic"
                >
                  No time entries logged for this month.
                </FxTableCell>
              </FxTableRow>
            )}
          </tbody>
        </FxTable>
      </FxTableScroll>
    </section>
  )
}
