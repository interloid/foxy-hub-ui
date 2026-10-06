'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { AlertCircle } from 'lucide-react'
import {
  TimeEntriesTableCardProps,
  TimeEntryStatus,
} from '../../types/time-entries'
import { useFormatter } from '@/context/locale-provider'
import type { Formatter } from '@/lib/format'

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

function formatDate(value: string, fmt: Formatter): string {
  if (!value) return ''
  return fmt.date(value, 'day')
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
  isError = false,
}: TimeEntriesTableCardProps) {
  const fmt = useFormatter()
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
      <FxTable>
        <FxTableHeader>
          <FxTableRow className="text-[11px]">
            <FxTableHead className="w-30">DATE</FxTableHead>
            <FxTableHead className="w-60">TEAM</FxTableHead>
            <FxTableHead className="w-80">MILESTONE</FxTableHead>
            <FxTableHead className="w-120">DESCRIPTION</FxTableHead>
            <FxTableHead className="w-40">HOURS</FxTableHead>
            <FxTableHead className="w-40 text-center">STATUS</FxTableHead>
          </FxTableRow>
        </FxTableHeader>
        <tbody>
          {isError ? (
            <FxTableRow className="hover:bg-transparent">
              <FxTableCell colSpan={6} className="px-5 py-8 text-center">
                <div className="text-destructive flex items-center justify-center gap-2 text-xs font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Failed to load time entries. Please try again.</span>
                </div>
              </FxTableCell>
            </FxTableRow>
          ) : safeEntries.length > 0 ? (
            safeEntries.map((entry) => {
              const statusConfig =
                STATUS_BADGE_CONFIG[entry.status] || STATUS_BADGE_CONFIG.draft

              return (
                <FxTableRow key={entry.id}>
                  {/* Date */}
                  <FxTableCell className="text-muted-foreground text-[12.5px] font-normal">
                    {formatDate(entry.workDate, fmt)}
                  </FxTableCell>

                  {/* Team Member */}
                  <FxTableCell className="flex items-center">
                    <div className="flex items-center gap-2">
                      <div
                        aria-hidden="true"
                        className={`text-brand-white flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          entry.avatarColorClass || 'bg-success'
                        }`}
                      >
                        {entry.authorInitials}
                      </div>
                      <span className="text-foreground text-[12.5px] font-medium">
                        {entry.authorName}
                      </span>
                    </div>
                  </FxTableCell>

                  {/* Milestone */}
                  <FxTableCell className="text-subtle-foreground text-[12.5px] font-normal">
                    {entry.milestoneTitle || '—'}
                  </FxTableCell>

                  {/* Description */}
                  <FxTableCell className="text-foreground max-w-[320px] truncate text-[12.5px] font-normal">
                    {entry.description}
                  </FxTableCell>

                  {/* Hours */}
                  <FxTableCell numeric className="text-left text-[13px]">
                    {formatDuration(entry.durationMinutes)}
                  </FxTableCell>

                  {/* Status */}
                  <FxTableCell className="text-center text-[11px]">
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
    </section>
  )
}
