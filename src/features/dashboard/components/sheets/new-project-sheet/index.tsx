'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import {
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx-field'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  FxDropdownMenuContent,
  FxDropdownMenuItem,
  FxPopoverContent,
  Popover,
  PopoverTrigger,
} from '@/components/shared/fx-menu'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
} from '@/components/shared/fx-sheet'
import { FxTextarea } from '@/components/shared/fx-textarea'
import {
  ClientOption,
  createProject,
  TeamMemberOption,
} from '@/features/dashboard/actions'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { toISODate } from '@/lib/date'
import { EngagementModelSelector } from './engagement-model-selector'
import { PricingHint } from './pricing-hint'
import { StartFromSelector } from './start-from-selector'
import {
  ModelFitSuggestion,
  TeamAllocationSection,
} from './team-allocation-section'
import { computePricingInsight } from '@/features/dashboard/pricing'
import { newProjectFormSchema } from '@/features/dashboard/schema'
import { NewProjectFormValues } from './types'

interface NewProjectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewProjectSheet({ open, onOpenChange }: NewProjectSheetProps) {
  const todayStr = toISODate(new Date())
  const { orgSlug } = useWorkspace()
  const {
    control,
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<NewProjectFormValues>({
    resolver: zodResolver(newProjectFormSchema),
    mode: 'onBlur',
    defaultValues: {
      projectName: '',
      selectedStartFrom: 'Blank project',
      targetDate: undefined,

      selectedEngagement: 'full_time',
      budget: '',
      fixedPrice: '',
      estimatedHours: '',
      retainerBucketHours: '',
      retainerBillingPeriod: 'Monthly',
      retainerAmount: '',
      retainerOverageRate: '',
      brief: '',
      overrideReason: '',
      allocations: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'allocations',
  })

  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Watch values for reactive renders and dynamic validations
  const projectName = watch('projectName')
  const selectedStartFrom = watch('selectedStartFrom')
  const selectedClient = watch('selectedClient')
  const targetDate = watch('targetDate')
  const selectedEngagement = watch('selectedEngagement')
  const budget = watch('budget')
  const fixedPrice = watch('fixedPrice')
  const estimatedHours = watch('estimatedHours')
  const retainerBucketHours = watch('retainerBucketHours')
  const retainerBillingPeriod = watch('retainerBillingPeriod')
  const retainerAmount = watch('retainerAmount')
  const retainerOverageRate = watch('retainerOverageRate')
  const brief = watch('brief')
  const overrideReason = watch('overrideReason')
  const allocations = watch('allocations')

  const [existingHoursMap, setExistingHoursMap] = useState<
    Record<string, number>
  >({})
  const [maxCapacity, setMaxCapacity] = useState(8)
  const [orgMaxDaysPerWk, setOrgMaxDaysPerWk] = useState(7)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(true)

  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([])
  const [isLoadingTeam, setIsLoadingTeam] = useState(true)

  const allocationKey = allocations
    .map((r) => `${r.userId}:${r.effectiveFrom}`)
    .join('|')

  // Block negative symbol and scientific notation in numeric input fields
  const preventNegativeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '-' || e.key === 'e' || e.key === 'E') {
      e.preventDefault()
    }
  }

  // Check Capacity via HTTP GET Route Handler
  const checkCapacityForUser = useCallback(
    async (userId: string, dateStr?: string) => {
      try {
        const query = new URLSearchParams({
          type: 'teammate-capacity',
          userId,
          orgSlug,
          ...(dateStr && { dateStr }),
        })
        const res = await fetch(`/api/dashboard/sheet-data?${query}`)
        if (!res.ok) return

        const data = await res.json()
        setMaxCapacity(data.maxDailyCapacity)
        if (data.maxDaysPerWk) {
          setOrgMaxDaysPerWk(data.maxDaysPerWk)
        }
        setExistingHoursMap((prev) => ({
          ...prev,
          [userId]: data.existingHoursPerDay,
        }))
      } catch (err) {
        console.error('Failed to check teammate capacity', err)
      }
    },
    [orgSlug]
  )

  const handleCreateProject = () => {
    setSubmitError(null)

    const engagementMap: Record<
      string,
      'full_time' | 'part_time' | 'retainer' | 'fixed'
    > = {
      full_time: 'full_time',
      part_time: 'part_time',
      'full-time': 'full_time',
      'part-time': 'part_time',
      retainer: 'retainer',
      'fixed-price': 'fixed',
      fixed: 'fixed',
    }

    const mappedEngagement = engagementMap[selectedEngagement] || 'full_time'

    // Compute contractValue based on model (Budget or Fixed Price)
    const isFixed =
      selectedEngagement === 'fixed-price' || selectedEngagement === 'fixed'
    const rawContractVal = isFixed ? fixedPrice : budget
    const parsedContractValue =
      rawContractVal && rawContractVal.trim() !== ''
        ? parseFloat(rawContractVal)
        : null

    startTransition(async () => {
      const res = await createProject(
        {
          name: projectName,
          startFrom: selectedStartFrom,
          clientId: selectedClient || null,
          dueDate: targetDate ? toISODate(targetDate) : null,
          engagement: mappedEngagement,
          budget: parsedContractValue,
          estimatedHours:
            isFixed && estimatedHours && estimatedHours.trim() !== ''
              ? parseFloat(estimatedHours)
              : null,
          retainerBucketHours:
            selectedEngagement === 'retainer' && retainerBucketHours
              ? parseFloat(retainerBucketHours)
              : null,
          retainerBillingPeriod:
            selectedEngagement === 'retainer'
              ? (retainerBillingPeriod as 'Monthly' | 'Weekly')
              : null,
          retainerAmount:
            selectedEngagement === 'retainer' && retainerAmount
              ? parseFloat(retainerAmount)
              : null,
          retainerOverageRate:
            selectedEngagement === 'retainer' && retainerOverageRate
              ? parseFloat(retainerOverageRate)
              : null,

          brief: brief,
          overrideReason: overrideReason,
          allocations: allocations.map((row) => ({
            userId: row.userId,
            hoursPerDay: Number(row.hoursPerDay),
            daysPerWk: Number(row.daysPerWk),
            rate: row.rate ? Number(row.rate) : undefined,
            effectiveFrom: row.effectiveFrom || toISODate(new Date()),
          })),
        },
        orgSlug
      )

      if (!res.ok) {
        setSubmitError(res.error || 'Failed to create project.')
        toast.error(res.error ?? 'Failed to create project.')
        return
      }
      toast.success('Project created successfully')
      onOpenChange(false)
    })
  }

  useEffect(() => {
    if (!open) return
    for (const part of allocationKey.split('|')) {
      const [userId, effectiveFrom] = part.split(':')
      if (userId) checkCapacityForUser(userId, effectiveFrom)
    }
  }, [open, allocationKey, checkCapacityForUser])

  // Fetch initial clients and team members in parallel
  useEffect(() => {
    if (!open) return

    const controller = new AbortController()

    async function fetchData() {
      setIsLoadingClients(true)
      setIsLoadingTeam(true)

      try {
        const [clientsRes, membersRes] = await Promise.all([
          fetch(
            `/api/dashboard/sheet-data?type=clients&orgSlug=${encodeURIComponent(orgSlug)}`,
            { signal: controller.signal }
          ),
          fetch(
            `/api/dashboard/sheet-data?type=team-members&orgSlug=${encodeURIComponent(orgSlug)}`,
            { signal: controller.signal }
          ),
        ])

        const clients = await clientsRes.json()
        const members = await membersRes.json()

        setClientOptions(clients)
        setIsLoadingClients(false)

        setTeamMembers(members)
        setIsLoadingTeam(false)

        if (members.length > 0 && fields.length === 0) {
          const first = members[0]
          setValue('allocations', [
            {
              userId: first.id,
              memberName: first.name,
              preset: '8h',
              hoursPerDay: 8,
              daysPerWk: 5,
              rate: first.defaultRate ?? undefined,
              effectiveFrom: todayStr,
            },
          ])
          checkCapacityForUser(first.id, todayStr)
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError')
          console.error('Error fetching sheet data', err)
      }
    }

    fetchData()

    return () => controller.abort()
  }, [open, checkCapacityForUser, fields.length, setValue, todayStr, orgSlug])

  const selectedClientObj = clientOptions.find((c) => c.id === selectedClient)

  let overCommittedDetails: {
    memberName: string
    totalHours: number
    maxCapacity: number
  } | null = null

  if (allocations) {
    for (const row of allocations) {
      const existing = existingHoursMap[row.userId] || 0
      const total = existing + (Number(row.hoursPerDay) || 0)
      if (total > maxCapacity) {
        overCommittedDetails = {
          memberName: (row.memberName || '').split('·')[0].trim(),
          totalHours: total,
          maxCapacity,
        }
        break
      }
    }
  }

  const pricingInsight = computePricingInsight({
    engagement: selectedEngagement,
    budget,
    fixedPrice,
    estimatedHours,
    retainerBucketHours,
    retainerAmount,
    retainerPeriod: retainerBillingPeriod,
    allocations: (allocations ?? []).map((row) => ({
      userId: row.userId,
      hoursPerDay: Number(row.hoursPerDay),
      daysPerWk: Number(row.daysPerWk),
      rate: row.rate,
      effectiveFrom: row.effectiveFrom,
    })),
    memberCosts: new Map(teamMembers.map((m) => [m.id, m.costRate])),
    targetDate,
  })

  const isOverCommitted = Boolean(overCommittedDetails)

  const modelFit: ModelFitSuggestion | null = (() => {
    const staffed = (allocations ?? []).filter(
      (row) => row.userId && Number(row.hoursPerDay) > 0
    )

    if (staffed.length === 0) return null

    const isFullTime =
      selectedEngagement === 'full_time' || selectedEngagement === 'full-time'
    const isPartTime =
      selectedEngagement === 'part_time' || selectedEngagement === 'part-time'

    if (
      isFullTime &&
      staffed.every((r) => Number(r.hoursPerDay) < maxCapacity)
    ) {
      const hours = staffed.map((r) => Number(r.hoursPerDay))
      const shown = Math.max(...hours)

      return {
        suggested: 'part_time',
        suggestedLabel: 'part-time',
        currentLabel: 'full-time',
        reason: `Nobody is booked for a full day — the largest allocation is ${shown} h/day of ${maxCapacity}h.`,
      }
    }

    if (
      isPartTime &&
      staffed.every((r) => Number(r.hoursPerDay) >= maxCapacity)
    ) {
      const shown = Math.min(...staffed.map((r) => Number(r.hoursPerDay)))

      return {
        suggested: 'full_time',
        suggestedLabel: 'full-time',
        currentLabel: 'part-time',
        reason: `Everyone is booked for a full day — the smallest allocation is ${shown} h/day of ${maxCapacity}h.`,
      }
    }

    return null
  })()
  const isSubmitDisabled =
    !projectName.trim() || (isOverCommitted && !overrideReason?.trim())

  const formattedTargetDate = targetDate
    ? targetDate.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
    : 'MM/DD/YYYY'

  const handleAddTeammate = () => {
    const defaultMember = teamMembers[0] || {
      id: '',
      name: 'Select teammate',
      defaultRate: null,
    }
    append({
      userId: defaultMember.id,
      memberName: defaultMember.name,
      preset: '8h',
      hoursPerDay: 8,
      daysPerWk: 5,
      rate: defaultMember.defaultRate ?? undefined,
      effectiveFrom: todayStr,
    })
    if (defaultMember.id) {
      checkCapacityForUser(defaultMember.id, todayStr)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent className="sm:max-w-135">
        <FxSheetHeader>
          <FxSheetTitle>New project</FxSheetTitle>
          <FxSheetDescription>
            Set up a project and assign it to a client.
          </FxSheetDescription>
        </FxSheetHeader>

        <FxSheetBody className="space-y-2">
          {/* Project Name */}
          <div className="w-full">
            <FxField data-invalid={Boolean(errors.projectName) || undefined}>
              <FxLabel
                htmlFor="project"
                className="text-muted-foreground required-star mb-1.5 block text-[13px] leading-normal font-medium"
              >
                Project name
              </FxLabel>
              <FxInput
                id="project"
                type="text"
                placeholder="e.g. Nordwave Packaging Refresh"
                className="text-[13px]"
                aria-invalid={Boolean(errors.projectName) || undefined}
                {...register('projectName')}
              />
              <FxFieldError errors={[errors.projectName]} />
            </FxField>
          </div>

          {/* Start From Options Grid */}
          <StartFromSelector
            value={selectedStartFrom}
            onChange={(val) => setValue('selectedStartFrom', val)}
          />

          {/* Client & Target End Date */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="w-full">
              <FxLabel
                htmlFor="client"
                className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
              >
                Client
              </FxLabel>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <FxButton
                    id="client"
                    type="button"
                    className="border-border bg-muted text-foreground hover:bg-muted flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] font-normal outline-none"
                  >
                    <span className="truncate">
                      {isLoadingClients
                        ? 'Loading clients...'
                        : selectedClientObj
                          ? selectedClientObj.name
                          : 'Select client'}
                    </span>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                  </FxButton>
                </DropdownMenuTrigger>
                <FxDropdownMenuContent align="start" className="w-56">
                  {clientOptions.length === 0 ? (
                    <FxDropdownMenuItem
                      onClick={() => setValue('selectedClient', '')}
                      className="text-muted-foreground text-[13px]"
                    >
                      No client (Internal)
                    </FxDropdownMenuItem>
                  ) : (
                    clientOptions.map((client) => (
                      <FxDropdownMenuItem
                        key={client.id}
                        onClick={() => setValue('selectedClient', client.id)}
                        className="hover:bg-primary! focus:bg-muted text-[13px]"
                      >
                        {client.name}
                      </FxDropdownMenuItem>
                    ))
                  )}
                </FxDropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="w-full">
              <FxLabel
                htmlFor="targetdate"
                className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
              >
                Target end date
              </FxLabel>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <FxButton
                    id="targetdate"
                    type="button"
                    className="border-border bg-muted text-foreground hover:bg-muted flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] font-normal outline-none"
                  >
                    <span>{formattedTargetDate}</span>
                    <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
                  </FxButton>
                </PopoverTrigger>
                <FxPopoverContent className="w-auto p-0" align="start">
                  <FxCalendar
                    mode="single"
                    selected={targetDate}
                    onSelect={(date) => {
                      setValue('targetDate', date)
                      setIsCalendarOpen(false)
                    }}
                    disabled={(date) => date < new Date()}
                    variant="compact"
                  />
                </FxPopoverContent>
              </Popover>
            </div>
          </div>

          {/* Engagement Model */}
          <EngagementModelSelector
            value={selectedEngagement}
            onChange={(val) => setValue('selectedEngagement', val)}
          />

          {/* Conditional Inputs Based on Engagement Model */}
          {(selectedEngagement === 'full_time' ||
            selectedEngagement === 'full-time' ||
            selectedEngagement === 'part_time' ||
            selectedEngagement === 'part-time') && (
            <FxField
              className="w-full"
              data-invalid={Boolean(errors.budget) || undefined}
            >
              <FxLabel
                htmlFor="contractvalue"
                className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
              >
                Contract value / budget ($)
              </FxLabel>
              <FxInput
                type="number"
                id="contractvalue"
                min={1}
                placeholder="24000"
                className="font-mono text-[13px]"
                aria-invalid={Boolean(errors.budget) || undefined}
                onKeyDown={preventNegativeInput}
                {...register('budget')}
              />
              <PricingHint
                insight={pricingInsight}
                hasValue={Boolean(budget?.trim())}
                onUseSuggestion={(amount) =>
                  setValue('budget', String(amount), { shouldValidate: true })
                }
              />
              <FxFieldError errors={[errors.budget]} />
            </FxField>
          )}

          {(selectedEngagement === 'fixed-price' ||
            selectedEngagement === 'fixed') && (
            <FxField
              className="w-full gap-1.5"
              data-invalid={Boolean(errors.fixedPrice) || undefined}
            >
              <FxLabel
                htmlFor="fixedprice"
                className="text-muted-foreground block text-[13px] font-medium"
              >
                Fixed price ($)
              </FxLabel>
              <FxInput
                type="number"
                id="fixedprice"
                min={1}
                placeholder="9600"
                className="font-mono text-[13px]"
                aria-invalid={Boolean(errors.fixedPrice) || undefined}
                onKeyDown={preventNegativeInput}
                {...register('fixedPrice')}
              />
              <p className="text-muted-foreground text-[12px]">
                Hours are tracked for capacity but billed at zero — the fee is
                fixed.
              </p>
              <PricingHint
                insight={pricingInsight}
                hasValue={Boolean(fixedPrice?.trim())}
                onUseSuggestion={(amount) =>
                  setValue('fixedPrice', String(amount), {
                    shouldValidate: true,
                  })
                }
              />
              <FxFieldError errors={[errors.fixedPrice]} />
            </FxField>
          )}

          {(selectedEngagement === 'fixed-price' ||
            selectedEngagement === 'fixed') && (
            <FxField
              className="w-full gap-1.5"
              data-invalid={Boolean(errors.estimatedHours) || undefined}
            >
              <FxLabel
                htmlFor="estimatedhours"
                className="text-muted-foreground block text-[13px] font-medium"
              >
                Estimated hours (optional)
              </FxLabel>
              <FxInput
                type="number"
                step="0.25"
                id="estimatedhours"
                min={1}
                placeholder="80"
                className="font-mono text-[13px]"
                aria-invalid={Boolean(errors.estimatedHours) || undefined}
                onKeyDown={preventNegativeInput}
                {...register('estimatedHours')}
              />
              <p className="text-muted-foreground text-[12px]">
                How big you think the job is. Fixed work is scoped in hours, not
                dates — this is what actual hours get measured against.
              </p>
              <FxFieldError errors={[errors.estimatedHours]} />
            </FxField>
          )}

          {selectedEngagement === 'retainer' && (
            <div className="space-y-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FxField
                  className="w-full"
                  data-invalid={
                    Boolean(errors.retainerBucketHours) || undefined
                  }
                >
                  <FxLabel
                    htmlFor="bucket"
                    className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
                  >
                    Bucket (hours)
                  </FxLabel>
                  <FxInput
                    type="number"
                    id="bucket"
                    min={1}
                    placeholder="80"
                    className="font-mono text-[13px]"
                    aria-invalid={
                      Boolean(errors.retainerBucketHours) || undefined
                    }
                    onKeyDown={preventNegativeInput}
                    {...register('retainerBucketHours')}
                  />
                  <FxFieldError errors={[errors.retainerBucketHours]} />
                </FxField>
                <div className="flex w-full flex-col gap-2">
                  <FxLabel
                    htmlFor="billingperiod"
                    className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
                  >
                    Billing period
                  </FxLabel>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <FxButton
                        id="billingperiod"
                        type="button"
                        className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] font-normal outline-none"
                      >
                        <span className="truncate">
                          {watch('retainerBillingPeriod') || 'Monthly'}
                        </span>
                        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                      </FxButton>
                    </DropdownMenuTrigger>
                    <FxDropdownMenuContent align="start" className="w-48">
                      {['Monthly', 'Weekly'].map((period) => (
                        <FxDropdownMenuItem
                          key={period}
                          onClick={() =>
                            setValue(
                              'retainerBillingPeriod',
                              period as 'Monthly' | 'Weekly'
                            )
                          }
                          className="hover:bg-primary! focus:bg-muted text-[13px]"
                        >
                          {period}
                        </FxDropdownMenuItem>
                      ))}
                    </FxDropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FxField
                  className="w-full"
                  data-invalid={Boolean(errors.retainerAmount) || undefined}
                >
                  <FxLabel
                    htmlFor="retaineramount"
                    className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
                  >
                    Retainer amount ($)
                  </FxLabel>
                  <FxInput
                    type="number"
                    id="retaineramount"
                    min={1}
                    placeholder="6000"
                    className="font-mono text-[13px]"
                    aria-invalid={Boolean(errors.retainerAmount) || undefined}
                    onKeyDown={preventNegativeInput}
                    {...register('retainerAmount')}
                  />
                  <FxFieldError errors={[errors.retainerAmount]} />
                </FxField>
                <FxField
                  className="w-full"
                  data-invalid={
                    Boolean(errors.retainerOverageRate) || undefined
                  }
                >
                  <FxLabel
                    htmlFor="overagerate"
                    className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
                  >
                    Overage rate (×)
                  </FxLabel>
                  <FxInput
                    type="number"
                    step="0.01"
                    id="overagerate"
                    min={0}
                    placeholder="1.25"
                    className="font-mono text-[13px]"
                    aria-invalid={
                      Boolean(errors.retainerOverageRate) || undefined
                    }
                    onKeyDown={preventNegativeInput}
                    {...register('retainerOverageRate')}
                  />
                  <FxFieldError errors={[errors.retainerOverageRate]} />
                </FxField>
              </div>

              <PricingHint
                insight={pricingInsight}
                hasValue={Boolean(retainerAmount?.trim())}
                onUseSuggestion={(amount) =>
                  setValue('retainerAmount', String(amount), {
                    shouldValidate: true,
                  })
                }
              />
            </div>
          )}

          {/* Team Allocation Section */}
          <TeamAllocationSection
            fields={fields}
            allocations={allocations}
            teamMembers={teamMembers}
            isLoadingTeam={isLoadingTeam}
            maxCapacity={maxCapacity}
            orgMaxDaysPerWk={orgMaxDaysPerWk}
            isOverCommitted={isOverCommitted}
            overCommittedDetails={overCommittedDetails}
            modelFit={modelFit}
            onSwitchEngagement={(engagement) =>
              setValue('selectedEngagement', engagement)
            }
            errors={errors}
            control={control}
            register={register}
            setValue={setValue}
            remove={remove}
            onAddTeammate={handleAddTeammate}
            checkCapacityForUser={checkCapacityForUser}
          />

          {/* Brief Input */}
          <div className="w-full">
            <FxLabel
              htmlFor="brief"
              className="text-muted-foreground mb-1.5 block text-[13px] font-medium"
            >
              Brief (optional)
            </FxLabel>
            <FxTextarea
              rows={3}
              id="brief"
              variant="subtle"
              placeholder="Scope, goals, key deliverables..."
              className="text-[13px]"
              {...register('brief')}
            />
          </div>
        </FxSheetBody>

        <FxSheetFooter className="border-border flex-col gap-2 border-t pt-3">
          {submitError && (
            <p className="text-destructive text-right text-[12px] font-medium">
              {submitError}
            </p>
          )}
          <div className="flex w-full items-center justify-end gap-2">
            <FxButton
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              className="text-foreground border-border text-[12.5px]"
            >
              Cancel
            </FxButton>
            <FxButton
              variant="default"
              disabled={isSubmitDisabled || isPending}
              onClick={handleSubmit(handleCreateProject)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-[12.5px] font-semibold disabled:opacity-50"
            >
              {isPending ? 'Creating...' : '+ Create project'}
            </FxButton>
          </div>
        </FxSheetFooter>
      </FxSheetContent>
    </Sheet>
  )
}
