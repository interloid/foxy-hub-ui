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
import { getTeammateAllocatedHours } from '@/features/dashboard/action'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronDown,
  Plus,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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

interface AllocationRow {
  id: string
  userId: string
  memberName: string
  preset: string
  hoursPerDay: number
  daysPerWk: number
  rate: number
  effectiveFrom: string
}

export function NewProjectSheet({ open, onOpenChange }: NewProjectSheetProps) {
  // Form State
  const [projectName, setProjectName] = useState('')
  const [selectedStartFrom, setSelectedStartFrom] = useState('Blank project')
  const [selectedClient, setSelectedClient] = useState(CLIENT_OPTIONS[0])
  const [targetDate, setTargetDate] = useState<Date | undefined>(
    new Date(2026, 8, 30)
  )
  const [selectedEngagement, setSelectedEngagement] = useState('full-time')
  const [budget, setBudget] = useState('24000')
  const [brief, setBrief] = useState('')
  const [overrideReason, setOverrideReason] = useState('')

  // Teammates State & Capacity Tracking
  const [allocations, setAllocations] = useState<AllocationRow[]>([
    {
      id: '1',
      userId: TEAM_MEMBERS[0].id,
      memberName: TEAM_MEMBERS[0].name,
      preset: '8h',
      hoursPerDay: 8,
      daysPerWk: 5,
      rate: 120,
      effectiveFrom: new Date().toISOString().split('T')[0],
    },
  ])

  const [existingHoursMap, setExistingHoursMap] = useState<
    Record<string, number>
  >({})
  const [maxCapacity, setMaxCapacity] = useState(8)
  const [orgMaxDaysPerWk, setOrgMaxDaysPerWk] = useState(7)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

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

  useEffect(() => {
    if (open) {
      allocations.forEach((row) => {
        checkCapacityForUser(row.userId, row.effectiveFrom)
      })
    }
  }, [open, allocations, checkCapacityForUser])

  // Derive Over-commitment status per render
  let overCommittedDetails: {
    memberName: string
    totalHours: number
    maxCapacity: number
  } | null = null

  for (const row of allocations) {
    const existing = existingHoursMap[row.userId] || 0
    const total = existing + row.hoursPerDay
    if (total > maxCapacity) {
      overCommittedDetails = {
        memberName: row.memberName.split('·')[0].trim(),
        totalHours: total,
        maxCapacity,
      }
      break
    }
  }

  const isOverCommitted = Boolean(overCommittedDetails)
  const isSubmitDisabled =
    !projectName.trim() || (isOverCommitted && !overrideReason.trim())

  const handleAddTeammate = () => {
    const defaultMember = TEAM_MEMBERS[0]
    const today = new Date().toISOString().split('T')[0]
    setAllocations((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        userId: defaultMember.id,
        memberName: defaultMember.name,
        preset: '8h',
        hoursPerDay: 8,
        daysPerWk: 5,
        rate: 100,
        effectiveFrom: today,
      },
    ])
    checkCapacityForUser(defaultMember.id, today)
  }

  const handleRemoveTeammate = (id: string) => {
    setAllocations((prev) => prev.filter((item) => item.id !== id))
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
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Nordwave Packaging Refresh"
              className="text-[13px]"
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
                    onClick={() => setSelectedStartFrom(option)}
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

          {/* Client & Target End Date Row */}
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
                    <span className="truncate">{selectedClient}</span>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <FxDropdownMenuContent align="start" className="w-56">
                  {CLIENT_OPTIONS.map((client) => (
                    <FxDropdownMenuItem
                      key={client}
                      onClick={() => setSelectedClient(client)}
                      className="text-[13px]"
                    >
                      {client}
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
                      setTargetDate(date)
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
                    onClick={() => setSelectedEngagement(model.id)}
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
              value={budget}
              onChange={(e) => {
                const val = Math.max(0, Number(e.target.value))
                setBudget(val.toString())
              }}
              placeholder="24000"
              className="font-mono text-[13px]"
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

            {allocations.map((row) => (
              <div
                key={row.id}
                className="border-border bg-muted/30 space-y-3 rounded-lg border p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="border-border bg-background text-foreground flex items-center justify-between rounded-md border px-3 py-1.5 text-[12.5px] font-medium outline-none"
                      >
                        <span>{row.memberName}</span>
                        <ChevronDown className="text-muted-foreground ml-2 size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <FxDropdownMenuContent align="start">
                      {TEAM_MEMBERS.map((m) => (
                        <FxDropdownMenuItem
                          key={m.id}
                          onClick={() => {
                            setAllocations((prev) =>
                              prev.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      userId: m.id,
                                      memberName: m.name,
                                    }
                                  : item
                              )
                            )
                            checkCapacityForUser(m.id, row.effectiveFrom)
                          }}
                        >
                          {m.name}
                        </FxDropdownMenuItem>
                      ))}
                    </FxDropdownMenuContent>
                  </DropdownMenu>

                  {allocations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTeammate(row.id)}
                      className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {['8h', '4h', '3h', '2h'].map((pill) => {
                    const isSelected = row.preset === pill
                    return (
                      <button
                        key={pill}
                        type="button"
                        onClick={() =>
                          setAllocations((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    preset: pill,
                                    hoursPerDay: Math.min(
                                      maxCapacity,
                                      Math.max(0, parseInt(pill))
                                    ),
                                  }
                                : item
                            )
                          )
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/20 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {pill}
                      </button>
                    )
                  })}
                </div>

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
                      value={row.hoursPerDay}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value) || 0
                        const val = Math.min(maxCapacity, Math.max(0, parsed))
                        setAllocations((prev) =>
                          prev.map((item) =>
                            item.id === row.id
                              ? { ...item, hoursPerDay: val }
                              : item
                          )
                        )
                      }}
                      className="h-8 px-1.5 font-mono text-[12px]"
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
                      value={row.daysPerWk}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value) || 0
                        const val = Math.min(
                          orgMaxDaysPerWk,
                          Math.max(0, parsed)
                        )
                        setAllocations((prev) =>
                          prev.map((item) =>
                            item.id === row.id
                              ? { ...item, daysPerWk: val }
                              : item
                          )
                        )
                      }}
                      className="h-8 px-1.5 font-mono text-[12px]"
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
                      value={row.rate}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value) || 1
                        const val = Math.max(1, parsed)
                        setAllocations((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, rate: val } : item
                          )
                        )
                      }}
                      className="h-8 px-1.5 font-mono text-[12px]"
                    />
                  </div>

                  {/* Effective From */}
                  <div className="w-full min-w-0">
                    <label className="text-muted-foreground block truncate text-[10px] font-semibold uppercase">
                      Effective From
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="border-border bg-background text-foreground hover:bg-muted flex h-8 w-full items-center justify-between rounded-md border px-2 font-mono text-[11.5px] outline-none"
                        >
                          <span className="truncate">
                            {row.effectiveFrom
                              ? new Date(
                                  row.effectiveFrom + 'T00:00:00'
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
                      <FxPopoverContent className="w-auto p-0" align="start">
                        <FxCalendar
                          mode="single"
                          selected={
                            row.effectiveFrom
                              ? new Date(row.effectiveFrom + 'T00:00:00')
                              : undefined
                          }
                          onSelect={(date) => {
                            if (!date) return

                            const isoDate = date.toISOString().split('T')[0]

                            setAllocations((prev) =>
                              prev.map((item) =>
                                item.id === row.id
                                  ? { ...item, effectiveFrom: isoDate }
                                  : item
                              )
                            )

                            checkCapacityForUser(row.userId, isoDate)
                          }}
                          disabled={(date) => date < today}
                          variant="compact"
                        />
                      </FxPopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            ))}

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
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why is this over-commitment acceptable?"
                    className="border-destructive/40 bg-background text-[12px]"
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
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Scope, goals, key deliverables..."
              className="text-[13px]"
            />
          </div>
        </FxSheetBody>

        <FxSheetFooter className="border-border border-t pt-3">
          <div className="flex w-full items-center justify-end gap-2">
            <FxButton
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-foreground border-border text-[12.5px]"
            >
              Cancel
            </FxButton>
            <FxButton
              variant="default"
              size="sm"
              disabled={isSubmitDisabled}
              onClick={() => onOpenChange(false)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-[12.5px] font-semibold disabled:opacity-50"
            >
              + Create project
            </FxButton>
          </div>
        </FxSheetFooter>
      </FxSheetContent>
    </Sheet>
  )
}
