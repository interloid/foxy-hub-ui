'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import { FxInput, FxLabel } from '@/components/shared/fx-field'
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
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { toISODate } from '@/lib/date'
import { EngagementModelSelector } from './engagement-model-selector'
import { StartFromSelector } from './start-from-selector'
import { TeamAllocationSection } from './team-allocation-section'
import { NewProjectFormValues } from './types'

interface NewProjectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewProjectSheet({ open, onOpenChange }: NewProjectSheetProps) {
  const todayStr = toISODate(new Date())
  const { orgSlug } = useWorkspace()
  const { control, register, watch, setValue } = useForm<NewProjectFormValues>({
    defaultValues: {
      projectName: '',
      selectedStartFrom: 'Blank project',
      targetDate: undefined,
      selectedEngagement: 'full-time',
      budget: '',
      fixedPrice: '',
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
      'full-time': 'full_time',
      'part-time': 'part_time',
      retainer: 'retainer',
      'fixed-price': 'fixed',
      fixed: 'fixed',
    }

    const mappedEngagement = engagementMap[selectedEngagement] || 'full_time'

    // Select relevant numeric budget based on model
    const calculatedBudget =
      selectedEngagement === 'fixed-price' || selectedEngagement === 'fixed'
        ? fixedPrice
        : budget

    startTransition(async () => {
      const res = await createProject(
        {
          name: projectName,
          startFrom: selectedStartFrom,
          clientId: selectedClient || null,
          dueDate: targetDate ? toISODate(targetDate) : null,
          engagement: mappedEngagement,
          budget: calculatedBudget ? parseFloat(calculatedBudget) : null,
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
              rate: 120,
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

  const isOverCommitted = Boolean(overCommittedDetails)
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
    }
    append({
      userId: defaultMember.id,
      memberName: defaultMember.name,
      preset: '8h',
      hoursPerDay: 8,
      daysPerWk: 5,
      rate: 100,
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

        <FxSheetBody className="space-y-5">
          {/* Project Name */}
          <div className="w-full">
            <FxLabel
              htmlFor="project"
              className="text-foreground mb-1.5 block text-[13px] font-medium"
            >
              Project name
            </FxLabel>
            <FxInput
              type="text"
              id="project"
              placeholder="e.g. Nordwave Packaging Refresh"
              className="text-[13px]"
              {...register('projectName')}
            />
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
                className="text-foreground mb-1.5 block text-[13px] font-medium"
              >
                Client
              </FxLabel>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <FxButton
                    id="client"
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
                className="text-foreground mb-1.5 block text-[13px] font-medium"
              >
                Target end date
              </FxLabel>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <FxButton
                    id="targetdate"
                    type="button"
                    className="border-border bg-muted/50 text-foreground hover:bg-muted flex w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none"
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
          {(selectedEngagement === 'full-time' ||
            selectedEngagement === 'part-time') && (
            <div className="w-full">
              <FxLabel
                htmlFor="contractvalue"
                className="text-foreground mb-1.5 block text-[13px] font-medium"
              >
                Contract value / budget ($)
              </FxLabel>
              <FxInput
                type="number"
                id="contractvalue"
                min={1}
                placeholder="24000"
                className="font-mono text-[13px]"
                {...register('budget')}
              />
            </div>
          )}

          {(selectedEngagement === 'fixed-price' ||
            selectedEngagement === 'fixed') && (
            <div className="w-full space-y-1.5">
              <FxLabel
                htmlFor="fixedprice"
                className="text-foreground block text-[13px] font-medium"
              >
                Fixed price ($)
              </FxLabel>
              <FxInput
                type="number"
                id="fixedprice"
                min={1}
                placeholder="9600"
                className="font-mono text-[13px]"
                {...register('fixedPrice')}
              />
              <p className="text-muted-foreground text-[12px]">
                Hours are tracked for capacity but billed at zero — the fee is
                fixed.
              </p>
            </div>
          )}

          {selectedEngagement === 'retainer' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="w-full">
                  <FxLabel
                    htmlFor="bucket"
                    className="text-foreground mb-1.5 block text-[13px] font-medium"
                  >
                    Bucket (hours)
                  </FxLabel>
                  <FxInput
                    type="number"
                    id="bucket"
                    min={1}
                    placeholder="80"
                    className="font-mono text-[13px]"
                    {...register('retainerBucketHours')}
                  />
                </div>
                <div className="w-full">
                  <FxLabel
                    htmlFor="billingperiod"
                    className="text-foreground mb-1.5 block text-[13px] font-medium"
                  >
                    Billing period
                  </FxLabel>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <FxButton
                        id="billingperiod"
                        type="button"
                        className="border-border bg-muted/50 text-foreground hover:bg-muted flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-[13px] outline-none"
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
                            setValue('retainerBillingPeriod', period)
                          }
                          className="hover:bg-muted/50! focus:bg-muted text-[13px]"
                        >
                          {period}
                        </FxDropdownMenuItem>
                      ))}
                    </FxDropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="w-full">
                  <FxLabel
                    htmlFor="retaineramount"
                    className="text-foreground mb-1.5 block text-[13px] font-medium"
                  >
                    Retainer amount ($)
                  </FxLabel>
                  <FxInput
                    type="number"
                    id="retaineramount"
                    min={1}
                    placeholder="6000"
                    className="font-mono text-[13px]"
                    {...register('retainerAmount')}
                  />
                </div>
                <div className="w-full">
                  <FxLabel
                    htmlFor="overagerate"
                    className="text-foreground mb-1.5 block text-[13px] font-medium"
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
                    {...register('retainerOverageRate')}
                  />
                </div>
              </div>
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
              className="text-foreground mb-1.5 block text-[13px] font-medium"
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
