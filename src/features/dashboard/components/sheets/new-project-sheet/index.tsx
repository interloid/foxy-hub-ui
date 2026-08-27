'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import { FxInput } from '@/components/shared/fx-field'
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
  getClientsForOrg,
  getTeammateAllocatedHours,
} from '@/features/dashboard/action'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronDown,
  Plus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'

interface NewProjectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const START_FROM_OPTIONS = [
  'Blank project',
  'Website build',
  'Brand identity',
  'Marketing campaign',
]

const CLIENT_OPTIONS = [
  'Nordwave Coffee',
  'Orbit Foods',
  'Acme Corp',
  'Starlight Tech',
]

const ENGAGEMENT_MODELS = [
  {
    id: 'full-time',
    title: 'Full-time',
    subtitle: '8 h/day committed',
    colorClass: 'bg-amber-500',
  },
  {
    id: 'part-time',
    title: 'Part-time',
    subtitle: 'Any fraction of a day',
    colorClass: 'bg-blue-500',
  },
  {
    id: 'retainer',
    title: 'Retainer',
    subtitle: 'A monthly bucket of hours',
    colorClass: 'bg-yellow-500',
  },
  {
    id: 'fixed-price',
    title: 'Fixed price',
    subtitle: 'Set fee — hours tracked, not billed',
    colorClass: 'bg-emerald-500',
  },
]

const TEAM_MEMBERS = [
  { id: 'usr_1', name: 'Marcus Lee · Member' },
  { id: 'usr_2', name: 'Sarah Chen · Lead' },
  { id: 'usr_3', name: 'Alex Rivera · Developer' },
]

interface AllocationFormValues {
  userId: string
  memberName: string
  preset: string
  hoursPerDay: number
  daysPerWk: number
  rate: number
  effectiveFrom: string
}

interface NewProjectFormValues {
  projectName: string
  selectedStartFrom: string
  selectedClient: string
  targetDate: Date | undefined
  selectedEngagement: string
  budget: string
  brief: string
  overrideReason: string
  allocations: AllocationFormValues[]
}

export function NewProjectSheet({ open, onOpenChange }: NewProjectSheetProps) {
  const todayStr = new Date().toISOString().split('T')[0]

  const { control, register, watch, setValue } = useForm<NewProjectFormValues>({
    defaultValues: {
      projectName: '',
      selectedStartFrom: 'Blank project',
      selectedClient: CLIENT_OPTIONS[0],
      targetDate: new Date(2026, 8, 30),
      selectedEngagement: 'full-time',
      budget: '24000',
      brief: '',
      overrideReason: '',
      allocations: [
        {
          userId: TEAM_MEMBERS[0].id,
          memberName: TEAM_MEMBERS[0].name,
          preset: '8h',
          hoursPerDay: 8,
          daysPerWk: 5,
          rate: 120,
          effectiveFrom: todayStr,
        },
      ],
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

  // Fetch DB allocation hours when sheet opens or teammate changes
  const checkCapacityForUser = useCallback(
    async (userId: string, dateStr?: string) => {
      const res = await getTeammateAllocatedHours(userId, dateStr)
      setMaxCapacity(res.maxDailyCapacity)
      if (res.maxDaysPerWk) {
        setOrgMaxDaysPerWk(res.maxDaysPerWk)
      }
      setExistingHoursMap((prev) => ({
        ...prev,
        [userId]: res.existingHoursPerDay,
      }))
    },
    []
  )

  const handleCreateProject = () => {
    setSubmitError(null)

    // Map UI state keys to database enum format
    const engagementMap: Record<
      string,
      'full_time' | 'part_time' | 'retainer' | 'fixed'
    > = {
      'full-time': 'full_time',
      'part-time': 'part_time',
      retainer: 'retainer',
      'fixed-price': 'fixed',
      fixed: 'fixed',
    }

    const mappedEngagement = engagementMap[selectedEngagement] || 'full_time'

    startTransition(async () => {
      const res = await createProject({
        name: projectName,
        startFrom: selectedStartFrom,
        clientId: selectedClient || null,
        dueDate: targetDate ? targetDate.toISOString() : null,
        engagement: mappedEngagement,
        budget: budget ? parseFloat(budget) : null,
        brief: brief,
        overrideReason: overrideReason,
        allocations: allocations.map((row) => ({
          userId: row.userId,
          hoursPerDay: Number(row.hoursPerDay),
          daysPerWk: Number(row.daysPerWk),
          rate: row.rate ? Number(row.rate) : undefined,
          effectiveFrom:
            row.effectiveFrom || new Date().toISOString().split('T')[0],
        })),
      })

      if (!res.success) {
        setSubmitError(res.error || 'Failed to create project.')
        return
      }

      onOpenChange(false)
    })
  }

  useEffect(() => {
    if (open && allocations) {
      allocations.forEach((row) => {
        if (row.userId) {
          checkCapacityForUser(row.userId, row.effectiveFrom)
        }
      })
    }
  }, [open, allocations, checkCapacityForUser])

  useEffect(() => {
    async function loadClients() {
      setIsLoadingClients(true)
      const data = await getClientsForOrg()
      setClientOptions(data)
      setIsLoadingClients(false)
    }
    loadClients()
  }, [])

  const selectedClientObj = clientOptions.find((c) => c.id === selectedClient)
  // Derive Over-commitment status per render
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

  const isOverCommitted = Boolean(overCommittedDetails)
  const isSubmitDisabled =
    !projectName.trim() || (isOverCommitted && !overrideReason.trim())

  const handleAddTeammate = () => {
    const defaultMember = TEAM_MEMBERS[0]
    append({
      userId: defaultMember.id,
      memberName: defaultMember.name,
      preset: '8h',
      hoursPerDay: 8,
      daysPerWk: 5,
      rate: 100,
      effectiveFrom: todayStr,
    })
    checkCapacityForUser(defaultMember.id, todayStr)
  }

  const formattedTargetDate = targetDate
    ? targetDate.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
    : 'MM/DD/YYYY'

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent className="sm:max-w-135">
        <FxSheetHeader>
          <FxSheetTitle>New project</FxSheetTitle>
          <FxSheetDescription>
            Set up a project and assign it to a client.
          </FxSheetDescription>
        </FxSheetHeader>

        <FxSheetBody className="space-y-5">
          {/* Project Name */}
          <div className="w-full">
            <label className="text-foreground mb-1.5 block text-[13px] font-medium">
              Project name
            </label>
            <FxInput
              type="text"
              placeholder="e.g. Nordwave Packaging Refresh"
              className="text-[13px]"
              {...register('projectName')}
            />
          </div>

          {/* Start From Options Grid */}
          <div className="w-full">
            <label className="text-foreground mb-1.5 block text-[13px] font-medium">
              Start from
            </label>
            <div className="grid grid-cols-2 gap-2">
              {START_FROM_OPTIONS.map((option) => {
                const isSelected = selectedStartFrom === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setValue('selectedStartFrom', option)}
                    className={cn(
                      'border-border rounded-md border p-2.5 text-left text-[12.5px] font-medium transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/10 text-foreground ring-primary ring-1'
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="w-full">
              <label className="text-foreground mb-1.5 block text-[13px] font-medium">
                Client
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="border-border bg-muted/50 text-foreground hover:bg-muted flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none"
                  >
                    <span className="truncate">
                      {isLoadingClients
                        ? 'Loading clients...'
                        : selectedClientObj
                          ? selectedClientObj.name
                          : 'Select client'}
                    </span>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <FxDropdownMenuContent align="start" className="w-56">
                  <FxDropdownMenuItem
                    onClick={() => setValue('selectedClient', '')}
                    className="text-muted-foreground text-[13px]"
                  >
                    No client (Internal)
                  </FxDropdownMenuItem>
                  {clientOptions.map((client) => (
                    <FxDropdownMenuItem
                      key={client.id}
                      onClick={() => setValue('selectedClient', client.id)}
                      className="text-[13px]"
                    >
                      {client.name}
                    </FxDropdownMenuItem>
                  ))}
                </FxDropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="w-full">
              <label className="text-foreground mb-1.5 block text-[13px] font-medium">
                Target end date
              </label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="border-border bg-muted/50 text-foreground hover:bg-muted flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none"
                  >
                    <span>{formattedTargetDate}</span>
                    <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
                  </button>
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
          <div className="w-full">
            <label className="text-foreground mb-1.5 block text-[13px] font-medium">
              Engagement model
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ENGAGEMENT_MODELS.map((model) => {
                const isSelected = selectedEngagement === model.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setValue('selectedEngagement', model.id)}
                    className={cn(
                      'border-border relative flex flex-col justify-start rounded-md border p-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/10 ring-primary ring-1'
                        : 'bg-muted/30 hover:bg-muted/60'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn('size-2 rounded-full', model.colorClass)}
                      />
                      <span className="text-foreground text-[13px] font-semibold">
                        {model.title}
                      </span>
                    </div>
                    <span className="text-muted-foreground mt-1 text-[11.5px]">
                      {model.subtitle}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Budget */}
          <div className="w-full">
            <label className="text-foreground mb-1.5 block text-[13px] font-medium">
              Contract value / budget ($)
            </label>
            <FxInput
              type="number"
              min={1}
              placeholder="24000"
              className="font-mono text-[13px]"
              {...register('budget')}
            />
          </div>

          {/* Team Allocation Section */}
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-foreground text-[13px] font-medium">
                Team allocation
              </label>
              <FxButton
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTeammate}
                className="h-7 text-[12px]"
              >
                <Plus className="mr-1 size-3.5" />
                Add teammate
              </FxButton>
            </div>

            {fields.map((fieldItem, index) => {
              const currentAllocation = allocations?.[index] || {}
              const isSingleRow = fields.length <= 1

              return (
                <div
                  key={fieldItem.id}
                  className="border-border bg-muted/30 space-y-3 rounded-xl border p-3.5"
                >
                  {/* Top Header Row with Teammate Select & Cross Button */}
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="border-border bg-background text-foreground flex h-9 flex-1 cursor-pointer items-center justify-between rounded-lg border px-3 text-[13px] font-medium transition-colors outline-none"
                        >
                          <span className="truncate">
                            {currentAllocation.memberName}
                          </span>
                          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                      <FxDropdownMenuContent align="start" className="w-64">
                        {TEAM_MEMBERS.map((m) => (
                          <FxDropdownMenuItem
                            key={m.id}
                            onClick={() => {
                              setValue(`allocations.${index}.userId`, m.id)
                              setValue(
                                `allocations.${index}.memberName`,
                                m.name
                              )
                              checkCapacityForUser(
                                m.id,
                                currentAllocation.effectiveFrom
                              )
                            }}
                          >
                            {m.name}
                          </FxDropdownMenuItem>
                        ))}
                      </FxDropdownMenuContent>
                    </DropdownMenu>

                    <FxButton
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      disabled={isSingleRow}
                      onClick={() => remove(index)}
                      className={cn(
                        'border-border bg-background size-8 shrink-0 transition-colors',
                        isSingleRow
                          ? 'cursor-not-allowed opacity-40'
                          : 'text-muted-foreground hover:bg-muted hover:text-destructive'
                      )}
                      aria-label="Remove teammate"
                    >
                      <X className="size-4" />
                    </FxButton>
                  </div>

                  {/* Preset Pills */}
                  <div className="flex items-center gap-1.5">
                    {['8h', '4h', '3h', '2h'].map((pill) => {
                      const isSelected = currentAllocation.preset === pill
                      return (
                        <button
                          key={pill}
                          type="button"
                          onClick={() => {
                            const hoursVal = Math.min(
                              maxCapacity,
                              Math.max(0, parseInt(pill))
                            )
                            setValue(`allocations.${index}.preset`, pill)
                            setValue(
                              `allocations.${index}.hoursPerDay`,
                              hoursVal
                            )
                          }}
                          className={cn(
                            'rounded-full border px-3 py-0.5 text-[11.5px] font-medium transition-colors',
                            isSelected
                              ? 'border-primary/50 bg-primary/10 text-primary font-semibold'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {pill}
                        </button>
                      )
                    })}
                  </div>

                  {/* Fields Grid */}
                  <div className="grid w-full grid-cols-[0.8fr_0.8fr_0.9fr_1.5fr] gap-1.5">
                    {/* Hours/Day */}
                    <div className="w-full min-w-0">
                      <label className="text-muted-foreground block truncate text-[10px] font-semibold uppercase">
                        Hours/Day
                      </label>
                      <FxInput
                        type="number"
                        step="1"
                        min={1}
                        max={maxCapacity}
                        className="h-8 px-1.5 font-mono text-[12px]"
                        {...register(`allocations.${index}.hoursPerDay`, {
                          valueAsNumber: true,
                          onChange: (e) => {
                            const parsed = parseFloat(e.target.value) || 0
                            const val = Math.min(
                              maxCapacity,
                              Math.max(0, parsed)
                            )
                            setValue(`allocations.${index}.hoursPerDay`, val)
                          },
                        })}
                      />
                    </div>

                    {/* Days/Wk */}
                    <div className="w-full min-w-0">
                      <label className="text-muted-foreground block truncate text-[10px] font-semibold uppercase">
                        Days/Wk
                      </label>
                      <FxInput
                        type="number"
                        min={1}
                        max={orgMaxDaysPerWk}
                        className="h-8 px-1.5 font-mono text-[12px]"
                        {...register(`allocations.${index}.daysPerWk`, {
                          valueAsNumber: true,
                          onChange: (e) => {
                            const parsed = parseInt(e.target.value) || 0
                            const val = Math.min(
                              orgMaxDaysPerWk,
                              Math.max(0, parsed)
                            )
                            setValue(`allocations.${index}.daysPerWk`, val)
                          },
                        })}
                      />
                    </div>

                    {/* Rate $/HR */}
                    <div className="w-full min-w-0">
                      <label className="text-muted-foreground block truncate text-[10px] font-semibold uppercase">
                        Rate $/HR
                      </label>
                      <FxInput
                        type="number"
                        min={1}
                        className="h-8 px-1.5 font-mono text-[12px]"
                        {...register(`allocations.${index}.rate`, {
                          valueAsNumber: true,
                        })}
                      />
                    </div>

                    {/* Effective From */}
                    <div className="w-full min-w-0">
                      <label className="text-muted-foreground block truncate text-[10px] font-semibold uppercase">
                        Effective From
                      </label>
                      <Controller
                        control={control}
                        name={`allocations.${index}.effectiveFrom`}
                        render={({ field: dateField }) => (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="border-border bg-background text-foreground hover:bg-muted flex h-8 w-full items-center justify-between rounded-md border px-2 font-mono text-[11.5px] outline-none"
                              >
                                <span className="truncate">
                                  {dateField.value
                                    ? new Date(
                                        dateField.value + 'T00:00:00'
                                      ).toLocaleDateString('en-US', {
                                        month: '2-digit',
                                        day: '2-digit',
                                        year: 'numeric',
                                      })
                                    : 'MM/DD/YYYY'}
                                </span>
                                <CalendarIcon className="text-muted-foreground ml-1 size-3.5 shrink-0" />
                              </button>
                            </PopoverTrigger>
                            <FxPopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <FxCalendar
                                mode="single"
                                selected={
                                  dateField.value
                                    ? new Date(dateField.value + 'T00:00:00')
                                    : undefined
                                }
                                onSelect={(date) => {
                                  if (!date) return
                                  const isoDate = date
                                    .toISOString()
                                    .split('T')[0]
                                  dateField.onChange(isoDate)
                                  checkCapacityForUser(
                                    currentAllocation.userId,
                                    isoDate
                                  )
                                }}
                                disabled={(date) => date < today}
                                variant="compact"
                              />
                            </FxPopoverContent>
                          </Popover>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            <p className="text-muted-foreground text-[11.5px] leading-snug">
              Part-time is first-class — set any hours/day. Rates snapshot onto
              each time entry; a change over time is a new dated row.
            </p>

            {/* Over-commitment Warning Box */}
            {isOverCommitted && overCommittedDetails && (
              <div className="border-destructive/50 bg-destructive/10 space-y-2 rounded-lg border p-3.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
                  <div className="text-[12px]">
                    <strong className="text-foreground font-semibold">
                      Over-commitment blocked
                    </strong>{' '}
                    — this allocation pushes someone past a standard working
                    day:
                    <div className="text-foreground mt-0.5 font-medium">
                      {overCommittedDetails.memberName} →{' '}
                      <span className="font-bold">
                        {overCommittedDetails.totalHours} h/day
                      </span>{' '}
                      (max {overCommittedDetails.maxCapacity}h)
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-destructive mb-1 block text-[11px] font-medium">
                    Owner override reason{' '}
                    <span className="text-destructive">*</span>
                  </label>
                  <FxInput
                    type="text"
                    placeholder="Why is this over-commitment acceptable?"
                    className="border-destructive/40 bg-background text-[12px]"
                    {...register('overrideReason')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Brief Input */}
          <div className="w-full">
            <label className="text-foreground mb-1.5 block text-[13px] font-medium">
              Brief (optional)
            </label>
            <FxTextarea
              rows={3}
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
              onClick={handleCreateProject}
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
