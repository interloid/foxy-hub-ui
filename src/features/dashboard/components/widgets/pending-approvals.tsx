'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { PendingApproval } from '@/features/dashboard/types'
import { approveDeliveryAction } from '@/features/projects/actions'
import { DeliverableFileSheet } from '@/features/projects/components/deliverables/deliverables-file-sheet'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { useFileActions } from '@/features/projects/hooks/use-file-actions'
import { getDeliveryById } from '@/features/projects/queries/get-deliverables'
import type { ProjectDelivery } from '@/features/projects/types'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useFormatter } from '@/context/locale-provider'
import type { Formatter } from '@/lib/format'

function dueMonth(value: string | null, fmt: Formatter): string {
  if (!value) return '-'
  return fmt.date(value, 'month') || '-'
}

interface PendingApprovalsProps {
  approvals: PendingApproval[]
  onViewAllClick?: () => void
  onApproveClick?: (id: string) => void
}

export function PendingApprovals({ approvals = [] }: PendingApprovalsProps) {
  const fmt = useFormatter()
  const hasApprovals = approvals && approvals.length > 0

  const [selectedDelivery, setSelectedDelivery] =
    useState<ProjectDelivery | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [isOpening, startOpening] = useTransition()

  const { handleViewFile, handleDownloadFile } = useFileActions('deliverables')
  const { orgSlug } = useWorkspace()

  const handleApprove = async (deliveryId: string) => {
    if (!selectedDelivery) return

    const result = await approveDeliveryAction(
      deliveryId,
      selectedDelivery.projectId,
      orgSlug
    )

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('Deliverable approved.')
    setIsSheetOpen(false)
  }

  const openDelivery = (item: PendingApproval) => {
    setOpeningId(item.id)

    startOpening(async () => {
      try {
        const delivery = await getDeliveryById(item.id, item.projectId)

        if (!delivery || !('id' in delivery)) {
          toast.error('Could not open that deliverable.')
          return
        }

        setSelectedDelivery(delivery)
        setIsSheetOpen(true)
      } catch (err) {
        console.error('Failed to load delivery:', err)
        toast.error('Could not open that deliverable.')
      } finally {
        setOpeningId(null)
      }
    })
  }

  // Re-read after an upload so the sheet's file list reflects what was just added.
  const handleSuccessUpload = async () => {
    if (!selectedDelivery) return

    try {
      const updated = await getDeliveryById(
        selectedDelivery.id,
        selectedDelivery.projectId
      )
      if (updated && 'id' in updated) setSelectedDelivery(updated)
    } catch (err) {
      console.error('Failed to refetch delivery assets:', err)
    }
  }

  return (
    <FxCard className="overflow-hidden">
      <FxCardContent className="p-0">
        {/* Card Header */}
        <div className="border-border flex items-center justify-between gap-2.5 border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h3 className="text-foreground text-[14px] font-semibold">
              Pending approvals
            </h3>
            <FxBadge
              shape="pill"
              size="count"
              className={
                hasApprovals
                  ? 'bg-warning-subtle text-warning font-sans text-[11px]'
                  : 'bg-muted text-muted-foreground font-sans text-[11px]'
              }
            >
              {hasApprovals ? `${approvals.length} waiting` : '0 waiting'}
            </FxBadge>
          </div>
        </div>

        {/* List of Approvals OR Empty State */}
        {hasApprovals ? (
          <div className="divide-border divide-y">
            {approvals.map((item) => (
              <div
                key={item.id}
                className="compact:items-center compact:flex-row compact:gap-0 flex flex-col justify-between gap-4 px-5 py-3.5 transition-colors"
              >
                <div className="compact:gap-3.5 flex min-w-0 items-center gap-5 pr-2">
                  <div
                    aria-hidden="true"
                    className="bg-warning-subtle text-primary-accent flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold uppercase"
                  >
                    {dueMonth(item.dueDate, fmt)}
                  </div>

                  {/* File Info */}
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13.5px] font-semibold">
                      {item.name}
                    </p>
                    <p className="text-muted-foreground text-[12px]">
                      <span className="block md:inline">{item.project} ·</span>{' '}
                      <span className="block md:inline">{item.client}</span>
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <FxButton
                  size="default"
                  onClick={() => openDelivery(item)}
                  disabled={isOpening && openingId === item.id}
                  className="border-border bg-muted text-foreground hover:border-border-strong hover:bg-muted shrink-0 gap-1.5 rounded-lg px-4 text-[12.5px]"
                >
                  {isOpening && openingId === item.id && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  View
                </FxButton>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
            <div className="bg-muted text-muted-foreground mb-2.5 flex h-10 w-10 items-center justify-center rounded-full">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="text-foreground text-[13.5px] font-medium">
              All caught up!
            </p>
            <p className="text-muted-foreground mt-0.5 text-[12px]">
              There are no pending approvals at the moment.
            </p>
          </div>
        )}
      </FxCardContent>

      <DeliverableFileSheet
        delivery={selectedDelivery}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onApprove={handleApprove}
        onViewFile={handleViewFile}
        onDownloadFile={handleDownloadFile}
        onSuccessUpload={handleSuccessUpload}
      />
    </FxCard>
  )
}
