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
import { TableRow } from '@/components/ui/table'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { isAdminRole } from '@/lib/role'
import { DeliverablesLoadingSkeleton } from '@/skeleton/deliverables'
import { format } from 'date-fns'
import { AlertCircle, Eye } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { submitDeliveryForApproval } from '../../actions'
import { useFileActions } from '../../hooks/use-file-actions'
import { ProjectDelivery, ProjectMilestone } from '../../types'
import { CreateDeliverySheet } from './create-deliverables-sheet'
import { DeliverableFileSheet } from './deliverables-file-sheet'

interface DeliverablesSectionProps {
  projectId: string
  milestones: ProjectMilestone[]
  deliveries: ProjectDelivery[]
  isOverview?: boolean
  isError?: boolean
  page?: number
  pageSize?: number
  totalCount?: number
  totalPages?: number
}

export function DeliverablesSection({
  projectId,
  milestones,
  deliveries,
  isOverview = false,
  isError = false,
  page = 1,
  pageSize = 5,
  totalCount = 0,
  totalPages = 1,
}: DeliverablesSectionProps) {
  const [selectedDelivery, setSelectedDelivery] =
    useState<ProjectDelivery | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const { handleViewFile, handleDownloadFile } = useFileActions('deliverables')
  const { orgId, userRole, orgSlug } = useWorkspace()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const updatePageUrl = (newPage: number) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('deliveriesPage', newPage.toString())
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const handleNextPage = () => {
    if (page < totalPages && !isPending) {
      updatePageUrl(page + 1)
    }
  }

  const handlePrevPage = () => {
    if (page > 1 && !isPending) {
      updatePageUrl(page - 1)
    }
  }

  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalCount)

  const isAuthorized = isAdminRole(userRole)
  const handleViewDelivery = (delivery: ProjectDelivery) => {
    setSelectedDelivery(delivery)
    setIsSheetOpen(true)
  }

  const handleSubmitForApproval = async (deliveryId: string) => {
    if (!selectedDelivery) return

    try {
      await submitDeliveryForApproval(
        deliveryId,
        selectedDelivery.projectId,
        orgSlug
      )

      setSelectedDelivery((prev) =>
        prev ? { ...prev, status: 'submitted' } : null
      )
      toast.success('Successfully submitted for approval')

      setIsSheetOpen(false)
    } catch (err) {
      console.error('Error submitting delivery:', err)
      toast.error('Failed to submit delivery for approval. Please try again.')
    }
  }

  return (
    <>
      <div className="bg-card border-border overflow-hidden rounded-xl border shadow-xs">
        {/* Header */}
        <div className="border-border compact:px-5 flex items-center justify-between border-b px-3 py-4">
          <h3 className="text-foreground text-[14px] font-semibold">
            Deliverables on this project
          </h3>
          {isAuthorized && !isOverview && (
            <div>
              <FxButton
                variant="default"
                size="default"
                onClick={() => setIsCreateOpen(true)}
              >
                Create Deliverable
              </FxButton>
              <CreateDeliverySheet
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                projectId={projectId}
                orgId={orgId ?? ''}
                milestones={milestones}
              />
            </div>
          )}
        </div>

        {/* FX Table */}
        <FxTable>
          <FxTableHeader className="bg-card">
            <TableRow className="border-border text-[11px]">
              <FxTableHead className="text-center">Date</FxTableHead>
              <FxTableHead className="text-center">Title</FxTableHead>
              <FxTableHead className="text-center">Description</FxTableHead>
              <FxTableHead className="text-center">Milestone</FxTableHead>
              <FxTableHead className="text-center">Due Date</FxTableHead>
              <FxTableHead className="text-center">Status</FxTableHead>
              {!isOverview && (
                <FxTableHead className="text-center">Action</FxTableHead>
              )}
            </TableRow>
          </FxTableHeader>

          <tbody>
            {isPending ? (
              <DeliverablesLoadingSkeleton
                count={pageSize}
                isOverview={isOverview}
              />
            ) : isError ? (
              <FxTableRow>
                <FxTableCell
                  colSpan={isOverview ? 6 : 7}
                  className="px-5 py-8 text-center"
                >
                  <div className="text-destructive flex items-center justify-center gap-2 text-xs font-medium">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Failed to load deliverables. Please refresh to try again.
                    </span>
                  </div>
                </FxTableCell>
              </FxTableRow>
            ) : deliveries.length === 0 ? (
              <FxTableRow>
                <FxTableCell
                  colSpan={isOverview ? 6 : 7}
                  className="text-muted-foreground px-5 py-8 text-center text-sm"
                >
                  No deliverables recorded for this project yet.
                </FxTableCell>
              </FxTableRow>
            ) : (
              deliveries.map((delivery) => (
                <FxTableRow
                  key={delivery.id}
                  onClick={() => handleViewDelivery(delivery)}
                  className="cursor-pointer"
                >
                  <FxTableCell className="text-muted-foreground text-center text-[12.5px] whitespace-nowrap">
                    {formatDate(delivery.createdAt)}
                  </FxTableCell>

                  <FxTableCell
                    className="text-foreground max-w-45 truncate text-center text-[12.5px] font-semibold"
                    title={delivery.title}
                  >
                    {delivery.title}
                  </FxTableCell>

                  <FxTableCell
                    className="text-muted-foreground max-w-60 truncate text-center text-[12.5px]"
                    title={delivery.description || undefined}
                  >
                    {delivery.description || '—'}
                  </FxTableCell>

                  <FxTableCell
                    className="text-muted-foreground max-w-40 truncate text-center text-[12.5px]"
                    title={delivery.milestoneTitle || undefined}
                  >
                    {delivery.milestoneTitle || '—'}
                  </FxTableCell>

                  <FxTableCell className="text-muted-foreground text-center text-[12.5px] whitespace-nowrap">
                    {delivery.dueDate ? formatDate(delivery.dueDate) : '—'}
                  </FxTableCell>

                  <FxTableCell className="text-center">
                    <TableStatusPill status={delivery.status} />
                  </FxTableCell>

                  {!isOverview && (
                    <FxTableCell className="text-center">
                      <FxButton
                        type="button"
                        variant="secondary"
                        className="text-muted-foreground"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewDelivery(delivery)
                        }}
                      >
                        <Eye className="text-muted-foreground mr-1 size-3" />
                        View
                      </FxButton>
                    </FxTableCell>
                  )}
                </FxTableRow>
              ))
            )}
          </tbody>
        </FxTable>

        {/* Pagination (Deliveries tab only) */}
        {!isOverview && totalCount > 0 && (
          <div className="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground text-center text-xs font-medium sm:text-left">
              Showing {startItem} to {endItem} of {totalCount} deliverables
            </span>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <FxButton
                variant="outline"
                size="sm"
                disabled={page <= 1 || isPending}
                onClick={handlePrevPage}
              >
                Previous
              </FxButton>
              <span className="text-foreground px-2 text-xs font-semibold whitespace-nowrap">
                Page {page} of {totalPages || 1}
              </span>
              <FxButton
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isPending}
                onClick={handleNextPage}
              >
                Next
              </FxButton>
            </div>
          </div>
        )}
      </div>

      {/* Deliverable File Sheet */}
      <DeliverableFileSheet
        delivery={selectedDelivery}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onSubmitForApproval={handleSubmitForApproval}
        onViewFile={handleViewFile}
        onDownloadFile={handleDownloadFile}
      />
    </>
  )
}

function TableStatusPill({
  status,
}: {
  status: 'pending' | 'approved' | 'rejected' | 'submitted'
}) {
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
    case 'pending':
    default:
      return (
        <FxBadge variant="info" size="sm" shape="pill" dot>
          Pending
        </FxBadge>
      )
  }
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'MMM d')
  } catch {
    return '—'
  }
}
