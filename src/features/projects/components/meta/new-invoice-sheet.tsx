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
import { useEffect, useRef, useState, useTransition } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import {
  BillingPeriodOption,
  formatMonthLabel,
  formatWeekLabel,
} from '../../lib/retainer-periods'
import {
  getRetainerInvoicePreview,
  hasInvoiceForProject,
} from '../../queries/get-invoice'
import {
  EngagementModel,
  InvoiceFormValues,
  NewInvoiceSheetProps,
  RetainerInvoicePreview,
} from '../../types/invoice'
import { useLocale } from '@/context/locale-provider'

const ENGAGEMENT_BADGE_CONFIG: Record<
  EngagementModel,
  { label: string; variant: 'default' | 'info' | 'warning' | 'success' }
> = {
  retainer: { label: 'Retainer', variant: 'warning' },
  fixed: { label: 'Fixed price', variant: 'success' },
  budget: { label: 'Budget-based', variant: 'default' },
  hourly: { label: 'Hourly', variant: 'info' },
}

const PICKER_TRIGGER_CLASS =
  'border-border bg-muted/50 text-foreground hover:bg-muted focus:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50'

interface PeriodPickerOption {
  value: string
  label: string
  invoiced: boolean
}

function PeriodPicker({
  id,
  label,
  value,
  placeholder,
  options,
  onSelect,
}: {
  id: string
  label: string
  value: string | null
  placeholder: string
  options: PeriodPickerOption[]
  onSelect: (value: string) => void
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <Label
        htmlFor={id}
        className="text-muted-foreground text-[12.5px] font-semibold"
      >
        {label}
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={options.length === 0}>
          <FxButton
            type="button"
            id={id}
            disabled={options.length === 0}
            className={PICKER_TRIGGER_CLASS}
          >
            <span className="truncate">{selected?.label ?? placeholder}</span>
            <ChevronDown className="text-muted-foreground size-4 shrink-0" />
          </FxButton>
        </DropdownMenuTrigger>
        <FxDropdownMenuContent
          align="start"
          className="max-h-72 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
        >
          {options.map((option) => (
            <FxDropdownMenuItem
              key={option.value}
              disabled={option.invoiced}
              onClick={() => onSelect(option.value)}
              className="hover:bg-primary! hover:text-brand-white! focus:bg-muted justify-between text-[13px]"
            >
              <span>{option.label}</span>
              {option.invoiced && (
                <span className="text-muted-foreground text-[11px]">
                  Invoiced
                </span>
              )}
            </FxDropdownMenuItem>
          ))}
        </FxDropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Latest week of `month` still to bill, else its latest week. */
function defaultWeekOf(periods: BillingPeriodOption[], month: string) {
  const weeks = periods.filter((p) => p.start.startsWith(month))
  return (weeks.filter((w) => !w.invoiced).at(-1) ?? weeks.at(-1))?.start
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
  // Whether each project already has an invoice, keyed by project id, so a slow answer
  // for a project the admin has moved off can't be read as the current one's.
  const [invoiceChecks, setInvoiceChecks] = useState<Record<string, boolean>>(
    {}
  )
  const [isCheckingInvoice, startTransition] = useTransition()
  const [isLoadingPreview, startPreview] = useTransition()
  const previewRequest = useRef(0)
  /** The retainer period the admin picked, and the lines billed for it. */
  const [periodSelection, setPeriodSelection] = useState<{
    projectId: string
    periodStart: string
    preview: RetainerInvoicePreview | null
  } | null>(null)
  const { control, handleSubmit, setValue, getValues } =
    useForm<InvoiceFormValues>({
      defaultValues: {
        projectId: defaultProjectId ?? projects[0]?.id ?? '',
        notes: '',
      },
    })

  const watchedProjectId = useWatch({ control, name: 'projectId' })
  const { currency, orgSlug } = useWorkspace()
  const activeProjectId =
    watchedProjectId || defaultProjectId || projects[0]?.id || ''

  const currentProject =
    projects.find((p) => p.id === activeProjectId) || projects[0]

  const isRetainer = currentProject?.engagement === 'retainer'
  const hasExistingInvoices =
    !isRetainer && Boolean(currentProject && invoiceChecks[currentProject.id])
  const billingPeriods = currentProject?.billingPeriods ?? []
  const pickedPeriod =
    periodSelection?.projectId === currentProject?.id ? periodSelection : null
  const selectedPeriodStart =
    pickedPeriod?.periodStart ?? currentProject?.periodStart ?? null
  const selectedPeriod = billingPeriods.find(
    (p) => p.start === selectedPeriodStart
  )
  // The server built `lines` for the default period; any other one is previewed.
  const isDefaultPeriod =
    !isRetainer || selectedPeriodStart === currentProject?.periodStart
  const lines = isDefaultPeriod
    ? (currentProject?.lines ?? [])
    : (pickedPeriod?.preview?.lines ?? [])
  const calloutMessage = isDefaultPeriod
    ? currentProject?.calloutMessage
    : pickedPeriod?.preview?.calloutMessage
  const isPeriodInvoiced = isRetainer
    ? Boolean(selectedPeriod?.invoiced)
    : hasExistingInvoices || hasExistingInvoice

  // Closing the sheet forgets the picked period. Done while rendering rather than in an
  // effect, so the closed sheet never renders once with the stale selection.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) setPeriodSelection(null)
  }

  const selectPeriod = (periodStart: string) => {
    if (!currentProject) return
    const projectId = currentProject.id
    const request = ++previewRequest.current

    setPeriodSelection({ projectId, periodStart, preview: null })
    if (periodStart === currentProject.periodStart) return

    startPreview(async () => {
      let preview: RetainerInvoicePreview
      try {
        preview = await getRetainerInvoicePreview(
          projectId,
          orgSlug,
          periodStart
        )
      } catch (err) {
        console.error('Failed to load retainer period:', err)
        preview = {
          lines: [],
          calloutMessage: 'Could not load this period. Please try again.',
        }
      }
      // A slower answer for a period the admin already moved off must not win.
      if (request === previewRequest.current) {
        setPeriodSelection({ projectId, periodStart, preview })
      }
    })
  }

  const locale = useLocale()
  const monthsByKey = new Map<string, PeriodPickerOption>()
  for (const period of billingPeriods) {
    const month = period.start.slice(0, 7)
    monthsByKey.set(month, {
      value: month,
      label: formatMonthLabel(period.start, locale),
      // A weekly month is only closed once every week in it is billed.
      invoiced: (monthsByKey.get(month)?.invoiced ?? true) && period.invoiced,
    })
  }
  const monthOptions = Array.from(monthsByKey.values()).reverse()

  const selectedMonth = selectedPeriodStart?.slice(0, 7) ?? null
  const weekOptions: PeriodPickerOption[] = billingPeriods
    .filter((p) => selectedMonth && p.start.startsWith(selectedMonth))
    .map((p) => ({
      value: p.start,
      label: formatWeekLabel(p, locale),
      invoiced: p.invoiced,
    }))
    .reverse()

  // Re-runs whenever the project object changes (including a refreshed `projects` list),
  // so an invoice created since the last check is picked up.
  useEffect(() => {
    const project = currentProject
    // Retainers are checked per period, from `billingPeriods`.
    if (!project?.id || project.engagement === 'retainer') return

    startTransition(async () => {
      let exists = false
      try {
        exists = await hasInvoiceForProject(project.id, project.engagement)
      } catch (err) {
        console.error('Failed to check existing invoice:', err)
      }
      setInvoiceChecks((prev) => ({ ...prev, [project.id]: exists }))
    })
  }, [currentProject])

  useEffect(() => {
    if (defaultProjectId) {
      setValue('projectId', defaultProjectId)
    } else if (projects.length > 0 && !getValues('projectId')) {
      setValue('projectId', projects[0].id)
    }
  }, [defaultProjectId, projects, setValue, getValues, open])

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0)

  const handleFormSubmit = (values: InvoiceFormValues) => {
    if (!currentProject) return
    onSubmit?.({
      projectId: currentProject.id,
      notes: values.notes,
      totalAmount,
      periodStart: isRetainer ? selectedPeriodStart : null,
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
                        className={PICKER_TRIGGER_CLASS}
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
                            onClick={() => field.onChange(project.id)}
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

            {/* Billing period (retainers bill one completed month / week) */}
            {isRetainer && (
              <div className="space-y-2">
                <div className="flex gap-3">
                  {currentProject?.retainerPeriod === 'weekly' ? (
                    <>
                      <PeriodPicker
                        id="billing-month"
                        label="Month"
                        value={selectedMonth}
                        placeholder="No completed week yet"
                        options={monthOptions}
                        onSelect={(month) => {
                          const week = defaultWeekOf(billingPeriods, month)
                          if (week) selectPeriod(week)
                        }}
                      />
                      <PeriodPicker
                        id="billing-week"
                        label="Week"
                        value={selectedPeriodStart}
                        placeholder="Select week"
                        options={weekOptions}
                        onSelect={selectPeriod}
                      />
                    </>
                  ) : (
                    <PeriodPicker
                      id="billing-month"
                      label="Billing month"
                      value={selectedPeriodStart?.slice(0, 7) ?? null}
                      placeholder="No completed month yet"
                      options={monthOptions}
                      onSelect={(month) => selectPeriod(`${month}-01`)}
                    />
                  )}
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Only completed{' '}
                  {currentProject?.retainerPeriod === 'weekly'
                    ? 'weeks'
                    : 'months'}{' '}
                  since the project started can be invoiced.
                </p>
              </div>
            )}

            {/* Callout Notice (Retainer / Fixed info) */}
            {calloutMessage && !isLoadingPreview && (
              <div className="border-warning bg-warning-subtle text-foreground flex items-center gap-2 rounded-md border p-3 text-xs">
                {' '}
                <AlertCircle className="text-primary h-4 w-4 shrink-0" />
                <span>{calloutMessage}</span>
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
                {isLoadingPreview ? (
                  <div className="text-muted-foreground px-4 py-8 text-center text-xs">
                    Loading this period…
                  </div>
                ) : lines.length > 0 ? (
                  lines.map((line) => (
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
            {isPeriodInvoiced && (
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
                isLoadingPreview ||
                lines.length === 0 ||
                isPeriodInvoiced ||
                (isRetainer && !selectedPeriod)
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
