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
import { TeamMemberOption } from '@/features/dashboard/action'
import { cn } from '@/lib/utils'
import { Calendar as CalendarIcon, ChevronDown, X } from 'lucide-react'
import {
  Control,
  Controller,
  UseFormRegister,
  UseFormSetValue,
  useWatch,
} from 'react-hook-form'
import { AllocationFormValues, NewProjectFormValues } from './types'
import { toISODate } from '@/lib/date'

interface TeamAllocationRowProps {
  index: number
  currentAllocation: AllocationFormValues
  isSingleRow: boolean
  teamMembers: TeamMemberOption[]
  isLoadingTeam: boolean
  maxCapacity: number
  orgMaxDaysPerWk: number
  control: Control<NewProjectFormValues>
  register: UseFormRegister<NewProjectFormValues>
  setValue: UseFormSetValue<NewProjectFormValues>
  remove: (index: number) => void
  checkCapacityForUser: (userId: string, dateStr?: string) => void
}

export function TeamAllocationRow({
  index,
  currentAllocation,
  isSingleRow,
  teamMembers,
  isLoadingTeam,
  maxCapacity,
  orgMaxDaysPerWk,
  control,
  register,
  setValue,
  remove,
  checkCapacityForUser,
}: TeamAllocationRowProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get current active hours directly from allocation values
  const activeHours = useWatch({
    control,
    name: `allocations.${index}.hoursPerDay`,
  })
  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-xl border p-3.5">
      {/* Top Header Row with Teammate Select & Cross Button */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="border-border bg-background text-foreground flex h-9 flex-1 cursor-pointer items-center justify-between rounded-lg border px-3 text-[13px] font-medium transition-colors outline-none"
            >
              <span className="truncate">
                {isLoadingTeam
                  ? 'Loading team...'
                  : currentAllocation?.memberName || 'Select teammate'}
              </span>
              <ChevronDown className="text-muted-foreground size-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <FxDropdownMenuContent align="start" className="w-64">
            {teamMembers.map((m) => (
              <FxDropdownMenuItem
                key={m.id}
                onClick={() => {
                  setValue(`allocations.${index}.userId`, m.id)
                  setValue(`allocations.${index}.memberName`, m.name)
                  checkCapacityForUser(m.id, currentAllocation?.effectiveFrom)
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
          const pillHours = parseInt(pill, 10)

          // Selection is determined purely by matching the current hoursPerDay value
          const isSelected = Number(activeHours) === pillHours

          return (
            <button
              key={pill}
              type="button"
              onClick={() => {
                const hoursVal = Math.min(maxCapacity, Math.max(0, pillHours))
                setValue(`allocations.${index}.hoursPerDay`, hoursVal, {
                  shouldValidate: true,
                  shouldDirty: true,
                  shouldTouch: true,
                })
                setValue(`allocations.${index}.preset`, pill, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
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
        {/* Hours/Day */}
        <div className="w-full min-w-0">
          <label className="text-muted-foreground block truncate text-[10px] font-semibold uppercase">
            Hours/Day
          </label>

          <Controller
            control={control}
            name={`allocations.${index}.hoursPerDay`}
            render={({ field }) => (
              <FxInput
                type="number"
                step="1"
                min={1}
                max={maxCapacity}
                className="h-8 px-1.5 font-mono text-[12px]"
                value={field.value ?? ''}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value) || 0
                  const val = Math.min(maxCapacity, Math.max(0, parsed))

                  field.onChange(val)

                  setValue(`allocations.${index}.preset`, `${val}h`, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            )}
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
                const parsed = parseInt(e.target.value, 10) || 0
                const val = Math.min(orgMaxDaysPerWk, Math.max(0, parsed))
                setValue(`allocations.${index}.daysPerWk`, val, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
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
                <FxPopoverContent className="w-auto p-0" align="start">
                  <FxCalendar
                    mode="single"
                    selected={
                      dateField.value
                        ? new Date(dateField.value + 'T00:00:00')
                        : undefined
                    }
                    onSelect={(date) => {
                      if (!date) return
                      const isoDate = toISODate(date)
                      dateField.onChange(isoDate)
                      checkCapacityForUser(currentAllocation?.userId, isoDate)
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
}
