'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { TableBody } from '@/components/ui/table'
import { formatMinutesToLabel } from '@/features/dashboard/components/sheets/log-time-sheet/duration-input'
import { cn } from '@/lib/utils'
import { Info, Loader2, Send } from 'lucide-react'
import { WeeklyTimeEntriesTableProps, WeeklyTimeEntryItem } from '../types'

function formatDateLabel(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function StatusBadge({ status }: { status: WeeklyTimeEntryItem['status'] }) {
  switch (status) {
    case 'approved':
      return (
        <FxBadge variant="success" dot shape="pill">
          Approved
        </FxBadge>
      )
    case 'submitted':
      return (
        <FxBadge variant="info" dot shape="pill">
          Submitted
        </FxBadge>
      )
    case 'rejected':
      return (
        <FxBadge variant="destructive" dot shape="pill">
          Rejected
        </FxBadge>
      )
    case 'draft':
    default:
      return (
        <FxBadge variant="secondary" dot shape="pill">
          Draft
        </FxBadge>
      )
  }
}

export function WeeklyTimeEntriesTable({
  entries,
  submittingId = null,
  onSubmitAllDrafts,
  onSubmitSingleDraft,
  className,
}: WeeklyTimeEntriesTableProps) {
  const draftEntries = entries.filter((e) => e.status === 'draft')
  const draftCount = draftEntries.length
  const isBatchSubmitting = submittingId === 'all'

  return (
    <div
      className={cn(
        'bg-card text-card-foreground border-border/70 overflow-hidden rounded-xl border shadow-xs',
        className
      )}
    >
      {/* Header Bar */}
      <div className="border-border/60 flex flex-col justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
        <h3 className="text-foreground text-[14px] font-semibold tracking-tight">
          This week&apos;s entries
        </h3>

        <div className="flex flex-wrap items-center gap-4">
          <FxButton
            size="sm"
            disabled={draftCount === 0 || submittingId !== null}
            onClick={onSubmitAllDrafts}
            variant="default"
            className="gap-1.5 px-3 py-4 text-[12px] font-medium shadow-xs disabled:opacity-50"
          >
            {isBatchSubmitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Submit {draftCount > 0 ? draftCount : ''} for approval
          </FxButton>
        </div>
      </div>

      {/* Table Content */}
      <FxTable>
        <FxTableHeader>
          <FxTableRow className="bg-muted/30 text-[11px]">
            <FxTableHead className="w-25 text-center">DATE</FxTableHead>
            <FxTableHead className="w-50 text-center">PROJECT</FxTableHead>
            <FxTableHead className="w-100 text-center">DESCRIPTION</FxTableHead>
            <FxTableHead className="w-25 text-center">HOURS</FxTableHead>
            <FxTableHead className="w-35 text-center">STATUS</FxTableHead>
          </FxTableRow>
        </FxTableHeader>

        <TableBody>
          {entries.length === 0 ? (
            <FxTableRow>
              <FxTableCell
                colSpan={5}
                className="text-muted-foreground py-8 text-center text-sm"
              >
                No time entries logged for this week yet.
              </FxTableCell>
            </FxTableRow>
          ) : (
            entries.map((entry) => {
              const isRowSubmitting = submittingId === entry.id
              return (
                <FxTableRow key={entry.id}>
                  <FxTableCell className="text-muted-foreground text-center text-sm font-medium">
                    {formatDateLabel(entry.workDate)}
                  </FxTableCell>

                  <FxTableCell className="text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-foreground text-[13px] font-semibold">
                        {entry.projectName}
                      </span>
                    </div>
                  </FxTableCell>

                  <FxTableCell className="text-foreground/90 text-center text-sm">
                    {entry.description}
                  </FxTableCell>

                  <FxTableCell className="text-center font-mono text-[13px] font-semibold tabular-nums">
                    {formatMinutesToLabel(entry.durationMinutes)}
                  </FxTableCell>

                  <FxTableCell className="text-center">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <StatusBadge status={entry.status} />

                      {entry.status === 'draft' && (
                        <FxButton
                          variant="outline"
                          size="xs"
                          disabled={submittingId !== null}
                          onClick={() => onSubmitSingleDraft?.(entry.id)}
                          className="text-2xs text-muted-foreground hover:text-foreground h-6 px-2 py-2 font-medium disabled:opacity-50"
                        >
                          {isRowSubmitting ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="size-3 animate-spin" />
                              Submitting...
                            </span>
                          ) : (
                            'Submit'
                          )}
                        </FxButton>
                      )}
                    </div>
                  </FxTableCell>
                </FxTableRow>
              )
            })
          )}
        </TableBody>
      </FxTable>

      {/* Card Footer Info Notice */}
      <div className="border-border/60 bg-muted/20 text-subtle-foreground flex items-center gap-2 border-t px-4 py-3 text-xs">
        <Info className="h-4 w-4 shrink-0" />
        <span className="text-sm">
          Approved entries become client-visible and billable. Descriptions are
          required on every entry.
        </span>
      </div>
    </div>
  )
}
