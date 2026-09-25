'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import {
  FxDropdownMenuContent,
  FxDropdownMenuItem,
} from '@/components/shared/fx-menu'
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
import { FxTextarea } from '@/components/shared/fx-textarea'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { formatCurrency } from '@/lib/money'
import { AlertCircle, ChevronDown, Send } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { hasInvoiceForProject } from '../../queries/get-invoice'
import {
  EngagementModel,
  InvoiceFormValues,
  NewInvoiceSheetProps,
  ProjectInvoiceContext,
} from '../../types/invoice'
import { useLocale } from '@/context/locale-provider'

const ENGAGEMENT_BADGE_CONFIG: Record<
  EngagementModel,
  { label: string; variant: 'default' | 'info' | 'warning' | 'success' }
> = {
  full_time: { label: 'Full-time', variant: 'default' },
  part_time: { label: 'Part-time', variant: 'info' },
  retainer: { label: 'Retainer', variant: 'warning' },
  fixed: { label: 'Fixed price', variant: 'success' },
}

export function NewInvoiceSheet({
  open,
  onOpenChange,
  projects = [],
  defaultProjectId,
  onSubmit,
  isSubmitting = false,
  hasExistingInvoice = false,
}: NewInvoiceSheetProps) {
  const locale = useLocale()
  const [hasExistingInvoices, setHasExistingInvoice] = useState(false)
  const [isCheckingInvoice, startTransition] = useTransition()
  const { control, handleSubmit, setValue, getValues, watch } =
    useForm<InvoiceFormValues>({
      defaultValues: {
        projectId: defaultProjectId ?? projects[0]?.id ?? '',
        notes: '',
      },
    })

  const watchedProjectId = watch('projectId')
  const { currency } = useWorkspace()
  const activeProjectId =
    watchedProjectId || defaultProjectId || projects[0]?.id || ''

  const currentProject =
    projects.find((p) => p.id === activeProjectId) || projects[0]

  const checkProjectInvoice = (project: ProjectInvoiceContext | undefined) => {
    if (!project?.id) {
      setHasExistingInvoice(false)
      return
    }
    startTransition(async () => {
      try {
        const exists = await hasInvoiceForProject(
          project.id,
          project.engagement,
          project.retainerPeriod
        )
        setHasExistingInvoice(exists)
      } catch (err) {
        console.error('Failed to check existing invoice:', err)
        setHasExistingInvoice(false)
      }
    })
  }
  useEffect(() => {
    checkProjectInvoice(currentProject)
  }, [currentProject, currentProject?.id, currentProject?.engagement])

  useEffect(() => {
    if (defaultProjectId) {
      setValue('projectId', defaultProjectId)
    } else if (projects.length > 0 && !getValues('projectId')) {
      setValue('projectId', projects[0].id)
    }
  }, [defaultProjectId, projects, setValue, getValues, open])

  const totalAmount = useMemo(() => {
    if (!currentProject?.lines) return 0
    return currentProject.lines.reduce((sum, line) => sum + line.amount, 0)
  }, [currentProject])

  const handleFormSubmit = (values: InvoiceFormValues) => {
    if (!currentProject) return
    onSubmit?.({
      projectId: currentProject.id,
      notes: values.notes,
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
            <FxSheetTitle className="text-[16px]">New invoice</FxSheetTitle>
            <FxSheetDescription className="text-[12px]">
              Generated from approved, unbilled hours.
            </FxSheetDescription>
          </div>
        </FxSheetHeader>

        {/* Body */}
        <FxSheetBody className="flex flex-col justify-between space-y-6">
          <form
            id="new-invoice-form"
            onSubmit={handleSubmit(handleFormSubmit)}
            className="space-y-6"
          >
            <div className="space-y-2">
              <Label
                htmlFor="project-select"
                className="text-muted-foreground text-[12.5px] font-semibold"
              >
                Project
              </Label>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      disabled={projects.length === 0}
                    >
                      <FxButton
                        type="button"
                        id="project-select"
                        disabled={projects.length === 0}
                        className="border-border bg-muted/50 text-foreground hover:bg-muted focus:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="truncate">
                          {currentProject?.name ?? 'Select project...'}
                        </span>
                        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                      </FxButton>
                    </DropdownMenuTrigger>
                    <FxDropdownMenuContent align="start" className="w-60">
                      {projects.length === 0 ? (
                        <div className="text-muted-foreground px-2 py-1.5 text-[12px]">
                          No projects available
                        </div>
                      ) : (
                        projects.map((project) => (
                          <FxDropdownMenuItem
                            key={project.id}
                            onClick={() => {
                              field.onChange(project.id)
                              checkProjectInvoice(project)
                            }}
                            className="hover:bg-primary! hover:text-brand-white! focus:bg-muted text-[13px]"
                          >
                            {project.name}
                          </FxDropdownMenuItem>
                        ))
                      )}
                    </FxDropdownMenuContent>
                  </DropdownMenu>
                )}
              />
            </div>

            {/* Billed To Meta */}
            {currentProject && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <span>Billed to</span>
                <span className="text-foreground font-bold">
                  {currentProject.clientName}
                </span>
                {engagementConfig && (
                  <FxBadge variant={engagementConfig.variant} size="sm" dot>
                    {engagementConfig.label}
                  </FxBadge>
                )}
              </div>
            )}

            {/* Callout Notice (Retainer / Fixed info) */}
            {currentProject?.calloutMessage && (
              <div className="border-warning bg-warning-subtle text-foreground flex items-center gap-2 rounded-md border p-3 text-xs">
                {' '}
                <AlertCircle className="text-primary h-4 w-4 shrink-0" />
                <span>{currentProject.calloutMessage}</span>
              </div>
            )}

            {/* Invoice Lines Table */}
            <div className="space-y-3">
              <Label className="text-subtle-foreground text-[12px] font-semibold">
                Invoice lines from approved hours
              </Label>

              <div className="border-border bg-card overflow-hidden rounded-xl border">
                {/* Table Header */}
                <div className="text-muted-foreground dark:bg-muted/40 bg-muted grid grid-cols-12 px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
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
                      className="border-border/50 grid grid-cols-12 items-center border-t px-4 py-3.5 text-[12px]"
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
                      <div className="text-foreground col-span-2 text-right text-[12.5px] font-bold">
                        {formatCurrency(line.amount, currency, { locale })}
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
            <div className="border-border/80 flex items-center justify-between border-t pt-3 text-[15px]">
              <span className="text-muted-foreground font-bold">Total</span>
              <span className="text-foreground text-base font-bold">
                {formatCurrency(totalAmount, currency, { locale })}
              </span>
            </div>

            <p className="text-muted-foreground text-[11px]">
              Time rounded up to the nearest 15 min at invoicing.
            </p>

            {/* Notes Section with FxTextarea */}
            <div className="space-y-2">
              <Label
                htmlFor="notes"
                className="text-muted-foreground text-[12px] font-semibold"
              >
                Notes to client (optional)
              </Label>
              <Controller
                control={control}
                name="notes"
                render={({ field }) => (
                  <FxTextarea
                    {...field}
                    id="notes"
                    placeholder="Payment terms, thanks, etc."
                    className="bg-muted min-h-22.5 text-xs"
                  />
                )}
              />
            </div>
          </form>
          <div className="text-muted-foreground text-center text-xs">
            {hasExistingInvoice && (
              <span className="text-primary text-center font-medium">
                An invoice has already been created for this billing period.
              </span>
            )}
          </div>
        </FxSheetBody>

        {/* Footer */}
        <FxSheetFooter className="flex flex-col items-start md:flex-row md:items-center">
          <div className="text-muted-foreground hidden items-center gap-2 text-xs md:flex">
            <span className="bg-info flex h-5 w-5 items-center justify-center rounded text-[10px] font-extrabold text-white">
              S
            </span>
            <span>Billed via Stripe · test mode</span>
          </div>

          <div className="flex gap-2 self-end">
            <SheetClose asChild>
              <FxButton
                type="button"
                variant="outline"
                size="sm"
                className="bg-muted h-9 px-4 text-[13px] font-medium"
              >
                Cancel
              </FxButton>
            </SheetClose>
            <FxButton
              type="submit"
              form="new-invoice-form"
              size="sm"
              disabled={
                isSubmitting ||
                isCheckingInvoice ||
                !currentProject?.lines.length ||
                hasExistingInvoices
              }
              className="bg-primary text-brand-white h-9 px-4 text-[13px] font-semibold"
            >
              {isSubmitting ? (
                <>
                  <span className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Generating invoice...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Generate invoice
                </>
              )}
            </FxButton>
          </div>
        </FxSheetFooter>
      </FxSheetContent>
    </Sheet>
  )
}
