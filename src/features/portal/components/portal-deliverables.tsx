'use client'

import { Check, Loader2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard } from '@/components/shared/fx-card'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { TableBody } from '@/components/ui/table'
import { approveDeliveryAction } from '@/features/projects/actions'
import { DeliverableFileSheet } from '@/features/projects/components/deliverables/deliverables-file-sheet'
import { useFileActions } from '@/features/projects/hooks/use-file-actions'
import type { ProjectDelivery } from '@/features/projects/types'
import { useFormatter } from '@/context/locale-provider'
import type { Formatter } from '@/lib/format'

/** Mirrors `TableStatusPill` in the staff card, so the two tables read alike. */
function StatusPill({ status }: { status: ProjectDelivery['status'] }) {
  switch (status) {
    case 'approved':
      return (
        <FxBadge variant="success" size="sm" shape="pill" dot>
          Approved
        </FxBadge>
      )
    case 'rejected':
      return (
        <FxBadge variant="destructive" size="sm" shape="pill" dot>
          Rejected
        </FxBadge>
      )
    case 'submitted':
      return (
        <FxBadge variant="warning" size="sm" shape="pill" dot>
          Submitted
        </FxBadge>
      )
    default:
      return (
        <FxBadge variant="secondary" size="sm" shape="pill" dot>
          Pending
        </FxBadge>
      )
  }
}

function formatDate(value: string | null | undefined, fmt: Formatter): string {
  if (!value) return '—'
  return fmt.date(value, 'date') || '—'
}

export function PortalDeliverables({
  deliveries,
  orgSlug,
  page = 1,
  pageSize = 5,
  totalCount = 0,
  totalPages = 1,
  variant = 'overview',
}: {
  deliveries: ProjectDelivery[]
  orgSlug: string
  page?: number
  pageSize?: number
  totalCount?: number
  totalPages?: number
  variant?: 'overview' | 'full'
}) {
  const fmt = useFormatter()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<ProjectDelivery[]>(deliveries)
  const [selected, setSelected] = useState<ProjectDelivery | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [isApproving, startApproving] = useTransition()

  const { handleViewFile, handleDownloadFile } = useFileActions('deliverables')

  const [prevDeliveries, setPrevDeliveries] = useState(deliveries)
  if (prevDeliveries !== deliveries) {
    setPrevDeliveries(deliveries)
    setRows(deliveries)
  }

  const approve = (delivery: ProjectDelivery) => {
    setApprovingId(delivery.id)

    startApproving(async () => {
      const result = await approveDeliveryAction(
        delivery.id,
        delivery.projectId,
        orgSlug
      )

      if (!result.ok) {
        toast.error(result.error)
        setApprovingId(null)
        return
      }

      setRows((prev) => prev.filter((row) => row.id !== delivery.id))
      setApprovingId(null)
      setIsSheetOpen(false)
      toast.success(`${delivery.title} approved.`)
    })
  }

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('deliveriesPage', String(next))
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const isFull = variant === 'full'
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalCount)

  return (
    <>
      <FxCard className="overflow-hidden p-0">
        <h3 className="text-foreground border-border/60 border-b px-5 py-4 text-[14px] font-semibold">
          Deliverables
        </h3>

        <div className="w-full overflow-x-auto">
          <FxTable className={isFull ? 'w-full min-w-220' : 'w-full min-w-140'}>
            <FxTableHeader>
              <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
                <FxTableHead className="w-32">Date</FxTableHead>
                <FxTableHead>Title</FxTableHead>
                {isFull && (
                  <FxTableHead className="w-56">Description</FxTableHead>
                )}
                <FxTableHead className="w-44">Milestone</FxTableHead>
                {isFull && <FxTableHead className="w-32">Due date</FxTableHead>}
                {isFull && <FxTableHead className="w-32">Status</FxTableHead>}
                <FxTableHead className="w-32 text-center">Action</FxTableHead>
              </FxTableRow>
            </FxTableHeader>

            <TableBody className="divide-border divide-y">
              {rows.length === 0 && (
                <FxTableRow>
                  <FxTableCell
                    colSpan={isFull ? 7 : 4}
                    className="text-muted-foreground px-5 py-8 text-center text-sm"
                  >
                    Nothing is waiting for your approval.
                  </FxTableCell>
                </FxTableRow>
              )}

              {rows.map((delivery) => (
                <FxTableRow
                  key={delivery.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelected(delivery)
                    setIsSheetOpen(true)
                  }}
                >
                  <FxTableCell className="text-muted-foreground text-[12.5px] whitespace-nowrap">
                    {formatDate(delivery.createdAt, fmt)}
                  </FxTableCell>

                  <FxTableCell
                    className="text-foreground max-w-60 truncate text-[12.5px] font-semibold"
                    title={delivery.title}
                  >
                    {delivery.title}
                  </FxTableCell>

                  {isFull && (
                    <FxTableCell
                      className="text-muted-foreground max-w-60 truncate text-[12.5px]"
                      title={delivery.description || undefined}
                    >
                      {delivery.description || '—'}
                    </FxTableCell>
                  )}

                  <FxTableCell
                    className="text-muted-foreground max-w-40 truncate text-[12.5px]"
                    title={delivery.milestoneTitle || undefined}
                  >
                    {delivery.milestoneTitle || '—'}
                  </FxTableCell>

                  {isFull && (
                    <FxTableCell className="text-muted-foreground text-[12.5px] whitespace-nowrap">
                      {formatDate(delivery.dueDate, fmt)}
                    </FxTableCell>
                  )}

                  {isFull && (
                    <FxTableCell>
                      <StatusPill status={delivery.status} />
                    </FxTableCell>
                  )}

                  <FxTableCell className="text-center">
                    <FxButton
                      type="button"
                      size="default"
                      disabled={isApproving && approvingId === delivery.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        approve(delivery)
                      }}
                    >
                      {isApproving && approvingId === delivery.id ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Check className="mr-1 size-3" />
                      )}
                      Approve
                    </FxButton>
                  </FxTableCell>
                </FxTableRow>
              ))}
            </TableBody>
          </FxTable>
        </div>

        {isFull && totalCount > 0 && (
          <div className="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground text-center text-xs font-medium sm:text-left">
              Showing {startItem} to {endItem} of {totalCount} deliverables
            </span>

            <div className="flex items-center justify-center gap-2">
              <FxButton
                variant="secondary"
                size="xs"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </FxButton>
              <FxButton
                variant="secondary"
                size="xs"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </FxButton>
            </div>
          </div>
        )}
      </FxCard>

      <DeliverableFileSheet
        delivery={selected}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onApprove={() => selected && approve(selected)}
        onViewFile={handleViewFile}
        onDownloadFile={handleDownloadFile}
      />
    </>
  )
}
