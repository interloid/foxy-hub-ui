'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxInput } from '@/components/shared/fx-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatter } from '@/context/locale-provider'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { getCurrencySymbol } from '@/lib/money'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Controller,
  useFormContext,
  type FieldError,
  useWatch,
} from 'react-hook-form'
import { DatePicker, preventNegativeInput } from './form-fields'
import { useNewProjectData } from './new-project-data-context'
import {
  hasBillRate,
  readAmount,
  requiresBillRate,
  type NewProjectWizardValues,
} from './schema'

const HOUR_PRESETS = ['8', '4', '3', '2']

const columnLabelClass =
  'text-muted-foreground mb-1.5 block text-[11px] font-semibold tracking-wider uppercase'
const cellInputClass = 'bg-card h-9 font-mono text-[13px]'

type NumericColumn = 'hoursPerDay' | 'daysPerWeek' | 'billRate'

interface AllocationRowProps {
  index: number
  onRemove: () => void
  /** False for the only row - a project needs at least one teammate. */
  canRemove: boolean
}

function getMargin(billRaw: string | undefined, cost: number | null) {
  const bill = readAmount(billRaw)
  if (!bill || Number.isNaN(bill) || cost === null) return null
  return Math.round(((bill - cost) / bill) * 100)
}

export function AllocationRow({
  index,
  onRemove,
  canRemove,
}: AllocationRowProps) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<NewProjectWizardValues>()
  const { currency } = useWorkspace()
  const { members } = useNewProjectData()
  const fmt = useFormatter()
  const symbol = getCurrencySymbol(currency)

  const row = useWatch({ control, name: `team.allocations.${index}` })
  const billingModel = useWatch({ control, name: 'billing.model' })
  // Hourly has no fee to fall back on, so the bill rate is required there.
  const billRateRequired = requiresBillRate(billingModel)
  const isMissingRequiredRate = billRateRequired && !hasBillRate(row.billRate)
  const allRows = useWatch({ control, name: 'team.allocations' })
  const takenMemberIds = new Set(
    allRows.filter((_, i) => i !== index).map((r) => r.memberId)
  )
  const kickoffDate = useWatch({ control, name: 'basics.kickoffDate' })
  const rowErrors = errors.team?.allocations?.[index]
  const member = members.find((m) => m.id === row.memberId)
  const costRate = member?.costRate ?? null
  const margin = getMargin(row.billRate, costRate)

  const numericCell = (
    column: NumericColumn,
    label: string,
    step: string,
    error?: FieldError,
    hint?: ReactNode,
    {
      required = false,
      invalid = false,
      max,
      wholeNumber = false,
    }: {
      required?: boolean
      invalid?: boolean
      // Caps typing at the column's limit (hours/day 24, days/wk 7) instead of letting
      // an impossible number in and only flagging it afterwards.
      max?: number
      wholeNumber?: boolean
    } = {}
  ) => (
    <div className="min-w-0">
      <label
        htmlFor={`allocation-${index}-${column}`}
        className={cn(columnLabelClass, required && 'required-star')}
      >
        {label}
      </label>
      <FxInput
        id={`allocation-${index}-${column}`}
        type="number"
        min={0}
        max={max}
        step={step}
        inputMode={wholeNumber ? 'numeric' : 'decimal'}
        onKeyDown={(e) => {
          preventNegativeInput(e)
          // Days are whole: no decimal point.
          if (wholeNumber && (e.key === '.' || e.key === ',')) {
            e.preventDefault()
          }
        }}
        className={cellInputClass}
        aria-invalid={Boolean(error) || invalid || undefined}
        {...register(`team.allocations.${index}.${column}`, {
          onChange: (e) => {
            if (max !== undefined && Number(e.target.value) > max) {
              setValue(`team.allocations.${index}.${column}`, String(max), {
                shouldValidate: true,
              })
            }
          },
        })}
      />
      {error ? (
        <p className="text-destructive mt-1 text-xs">{error.message}</p>
      ) : (
        hint
      )}
    </div>
  )

  return (
    <li className="border-border bg-muted/60 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name={`team.allocations.${index}.memberId`}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(memberId) => {
                field.onChange(memberId)
                // Seed the bill rate from the teammate's default - still editable per project.
                const next = members.find((m) => m.id === memberId)
                setValue(
                  `team.allocations.${index}.billRate`,
                  next?.defaultRate != null ? String(next.defaultRate) : ''
                )
              }}
            >
              <SelectTrigger
                aria-label={`Teammate ${index + 1}`}
                aria-invalid={Boolean(rowErrors?.memberId) || undefined}
                className="bg-card h-10! w-full min-w-0 flex-1 cursor-pointer text-[13px]"
              >
                <SelectValue placeholder="Select teammate" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                align="start"
                sideOffset={6}
                className="p-1"
              >
                {members
                  // Each teammate appears once: hide anyone already picked on another row.
                  .filter(
                    (option) =>
                      option.id === row.memberId ||
                      !takenMemberIds.has(option.id)
                  )
                  .map((option) => (
                    <SelectItem
                      key={option.id}
                      value={option.id}
                      className="cursor-pointer p-2 text-[13px]"
                    >
                      {option.name} · {option.roleLabel}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        />
        <FxButton
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`Remove teammate ${index + 1}`}
          onClick={onRemove}
          disabled={!canRemove}
          title={
            canRemove ? undefined : 'A project needs at least one teammate'
          }
          className="bg-card size-10 shrink-0"
        >
          <X className="text-muted-foreground size-4" />
        </FxButton>
      </div>
      {rowErrors?.memberId && (
        <p className="text-destructive -mt-2 text-xs">
          {rowErrors.memberId.message}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {HOUR_PRESETS.map((preset) => {
          const isSelected = Number(row.hoursPerDay) === Number(preset)
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={isSelected}
              onClick={() =>
                setValue(`team.allocations.${index}.hoursPerDay`, preset, {
                  shouldValidate: true,
                })
              }
              className={cn(
                'border-border bg-card text-foreground hover:bg-muted cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                isSelected && 'border-primary bg-primary/10 text-primary'
              )}
            >
              {preset}h
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {numericCell(
          'hoursPerDay',
          'Hours/day',
          '0.25',
          rowErrors?.hoursPerDay,
          undefined,
          { max: 24 }
        )}
        {numericCell(
          'daysPerWeek',
          'Days/wk',
          '1',
          rowErrors?.daysPerWeek,
          undefined,
          { max: 7, wholeNumber: true }
        )}
        {numericCell(
          'billRate',
          `Bill ${symbol}/hr`,
          '0.01',
          rowErrors?.billRate,
          isMissingRequiredRate && (
            <p className="text-destructive mt-1 text-xs">Required for Hourly</p>
          ),
          { required: billRateRequired, invalid: isMissingRequiredRate }
        )}
        {/* Read-only: the RPC snapshots cost from the membership at insert time, so a
            figure typed here would never be saved. Change it in the member's settings. */}
        <div className="min-w-0">
          <span className={columnLabelClass}>Cost {symbol}/hr</span>
          <div
            className="border-border bg-muted text-muted-foreground flex h-9 items-center rounded-md border px-3 font-mono text-[13px]"
            title="Set on the member's profile"
          >
            {costRate !== null
              ? fmt.currency(costRate, currency, { maximumFractionDigits: 2 })
              : 'Not set'}
          </div>
          {margin !== null && (
            <p
              className={cn(
                'mt-1 text-xs',
                margin < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {margin}% margin
            </p>
          )}
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <label
            htmlFor={`allocation-${index}-effectiveFrom`}
            className={columnLabelClass}
          >
            Effective from
          </label>
          <Controller
            control={control}
            name={`team.allocations.${index}.effectiveFrom`}
            render={({ field, fieldState }) => (
              <>
                <DatePicker
                  id={`allocation-${index}-effectiveFrom`}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  disabled={(date) =>
                    kickoffDate ? date < kickoffDate : false
                  }
                  className="bg-card hover:bg-card h-9"
                />
                {fieldState.error && (
                  <p className="text-destructive mt-1 text-xs">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            )}
          />
        </div>
      </div>
    </li>
  )
}
