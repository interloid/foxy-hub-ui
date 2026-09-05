'use client'

import { AlertCircle, Send, X } from 'lucide-react'
import * as React from 'react'

import { FxBadge } from '@/components/shared/fx-badge'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
  SheetClose,
} from '@/components/shared/fx-sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export type EngagementModel = 'full_time' | 'part_time' | 'retainer' | 'fixed'

export interface InvoiceLine {
  id: string
  description: string
  typeLabel: string
  qty: string
  rate: string
  amount: number
}

export interface ProjectInvoiceContext {
  id: string
  name: string
  clientName: string
  engagement: EngagementModel
  calloutMessage?: string | null
  lines: InvoiceLine[]
}

interface NewInvoiceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: ProjectInvoiceContext[]
  defaultProjectId?: string
  onSubmit?: (data: {
    projectId: string
    notes: string
    totalAmount: number
  }) => void
  isSubmitting?: boolean
}

const ENGAGEMENT_BADGE_CONFIG: Record<
  EngagementModel,
  { label: string; variant: 'orange' | 'blue' | 'amber' | 'emerald' }
> = {
  full_time: { label: 'Full-time', variant: 'orange' },
  part_time: { label: 'Part-time', variant: 'blue' },
  retainer: { label: 'Retainer', variant: 'amber' },
  fixed: { label: 'Fixed price', variant: 'emerald' },
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function NewInvoiceSheet({
  open,
  onOpenChange,
  projects = [],
  defaultProjectId,
  onSubmit,
  isSubmitting = false,
}: NewInvoiceSheetProps) {
  // 1. Manage user selection override in state
  const [userSelectedProjectId, setUserSelectedProjectId] = React.useState<
    string | null
  >(null)
  const [notes, setNotes] = React.useState('')

  // 2. Derive active project ID directly during render without useEffect
  const activeProjectId =
    userSelectedProjectId ?? defaultProjectId ?? projects[0]?.id ?? ''

  const currentProject =
    projects.find((p) => p.id === activeProjectId) || projects[0]

  const totalAmount = React.useMemo(() => {
    if (!currentProject?.lines) return 0
    return currentProject.lines.reduce((sum, line) => sum + line.amount, 0)
  }, [currentProject])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentProject) return
    onSubmit?.({
      projectId: currentProject.id,
      notes,
      totalAmount,
    })
  }

  const engagementConfig = currentProject
    ? ENGAGEMENT_BADGE_CONFIG[currentProject.engagement]
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent className="flex flex-col">
        {/* Header */}
        <FxSheetHeader className="flex flex-row items-start justify-between">
          <div className="space-y-1">
            <FxSheetTitle>New invoice</FxSheetTitle>
            <FxSheetDescription>
              Generated from approved, unbilled hours.
            </FxSheetDescription>
          </div>
        </FxSheetHeader>

        {/* Body */}
        <FxSheetBody className="space-y-6">
          <form
            id="new-invoice-form"
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* Project Select */}
            <div className="space-y-2">
              <Label
                htmlFor="project-select"
                className="text-foreground text-xs font-semibold"
              >
                Project
              </Label>
              <Select
                value={activeProjectId}
                onValueChange={(val) => setUserSelectedProjectId(val)}
              >
                <SelectTrigger
                  id="project-select"
                  className="border-border h-10 w-full bg-stone-50/80 text-sm"
                >
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Billed To Meta */}
            {currentProject && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <span>Billed to</span>
                <span className="text-foreground font-bold">
                  {currentProject.clientName}
                </span>
                {engagementConfig && (
                  <FxBadge variant={'default'} size="sm" dot>
                    {engagementConfig.label}
                  </FxBadge>
                )}
              </div>
            )}

            {/* Callout Notice (Retainer / Fixed info) */}
            {currentProject?.calloutMessage && (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{currentProject.calloutMessage}</span>
              </div>
            )}

            {/* Invoice Lines Table */}
            <div className="space-y-3">
              <Label className="text-foreground text-xs font-semibold">
                Invoice lines — from approved hours
              </Label>

              <div className="border-border bg-card overflow-hidden rounded-xl border">
                {/* Table Header */}
                <div className="text-muted-foreground dark:bg-muted/40 grid grid-cols-12 bg-stone-50/80 px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                  <div className="col-span-6">DESCRIPTION</div>
                  <div className="col-span-2 text-right">QTY</div>
                  <div className="col-span-2 text-right">RATE</div>
                  <div className="col-span-2 text-right">AMOUNT</div>
                </div>

                {/* Table Content */}
                {currentProject?.lines && currentProject.lines.length > 0 ? (
                  currentProject.lines.map((line) => (
                    <div
                      key={line.id}
                      className="border-border/50 grid grid-cols-12 items-center border-t px-4 py-3.5 text-xs"
                    >
                      <div className="col-span-6 space-y-0.5">
                        <div className="text-foreground font-bold">
                          {line.description}
                        </div>
                        <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                          {line.typeLabel}
                        </div>
                      </div>
                      <div className="text-muted-foreground col-span-2 text-right">
                        {line.qty}
                      </div>
                      <div className="text-muted-foreground col-span-2 text-right">
                        {line.rate}
                      </div>
                      <div className="text-foreground col-span-2 text-right font-bold">
                        {formatCurrency(line.amount)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground px-4 py-8 text-center text-xs leading-relaxed">
                    No approved, unbilled hours for this project yet. Approve a
                    timesheet first.
                  </div>
                )}
              </div>
            </div>

            {/* Total Row */}
            <div className="border-border/80 flex items-center justify-between border-t pt-3">
              <span className="text-foreground text-sm font-bold">Total</span>
              <span className="text-foreground text-base font-bold">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            <p className="text-muted-foreground text-[11px]">
              Time rounded up to the nearest 15 min at invoicing.
            </p>

            {/* Notes Section */}
            <div className="space-y-2">
              <Label
                htmlFor="notes"
                className="text-foreground text-xs font-semibold"
              >
                Notes to client (optional)
              </Label>
              <Textarea
                id="notes"
                placeholder="Payment terms, thanks, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border-border min-h-[90px] resize-y bg-stone-50/80 text-xs"
              />
            </div>
          </form>
        </FxSheetBody>

        {/* Footer */}
        <FxSheetFooter>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-[10px] font-extrabold text-white">
              S
            </span>
            <span>Billed via Stripe · test mode</span>
          </div>

          <div className="flex items-center gap-2">
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 bg-stone-50 px-4 text-xs font-medium"
              >
                Cancel
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="new-invoice-form"
              disabled={isSubmitting || !currentProject?.lines.length}
              className="h-9 bg-orange-600 px-4 text-xs font-semibold text-white hover:bg-orange-700"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Generate invoice
            </Button>
          </div>
        </FxSheetFooter>
      </FxSheetContent>
    </Sheet>
  )
}
