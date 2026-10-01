'use client'

import { FxInput } from '@/components/shared/fx-field'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, X } from 'lucide-react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { DatePicker, preventNegativeInput } from './form-fields'
import type { NewProjectWizardValues } from './schema'

interface MilestoneRowProps {
  index: number
  onRemove: () => void
  /** False for the last remaining milestone - a project needs at least one. */
  canRemove: boolean
}

export function MilestoneRow({
  index,
  onRemove,
  canRemove,
}: MilestoneRowProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<NewProjectWizardValues>()

  const kickoffDate = useWatch({ control, name: 'basics.kickoffDate' })
  const rowErrors = errors.scope?.milestones?.[index]
  const rowError =
    rowErrors?.name?.message ?? rowErrors?.estimatedHours?.message

  return (
    <li className="flex items-start gap-3">
      <span className="bg-muted text-muted-foreground mt-2 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
        {index + 1}
      </span>

      <div className="border-border bg-muted/60 flex min-w-0 flex-1 flex-col gap-2.5 rounded-lg border p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_92px]">
          <FxInput
            aria-label={`Milestone ${index + 1} name`}
            placeholder="e.g. Design concepts presented"
            className="bg-card h-9 text-[13px]"
            aria-invalid={Boolean(rowErrors?.name) || undefined}
            {...register(`scope.milestones.${index}.name`)}
          />
          <Controller
            control={control}
            name={`scope.milestones.${index}.dueDate`}
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={field.onChange}
                placeholder="Pick a date"
                disabled={(date) => (kickoffDate ? date < kickoffDate : false)}
                className="bg-card hover:bg-card h-9 flex-row-reverse justify-end"
              />
            )}
          />
          <FxInput
            type="number"
            min={0}
            step="0.5"
            inputMode="decimal"
            aria-label={`Milestone ${index + 1} estimated hours`}
            placeholder="est h"
            onKeyDown={preventNegativeInput}
            className="bg-card h-9 text-[13px] placeholder:font-mono"
            aria-invalid={Boolean(rowErrors?.estimatedHours) || undefined}
            {...register(`scope.milestones.${index}.estimatedHours`)}
          />
        </div>

        {rowError && <p className="text-destructive text-xs">{rowError}</p>}

        <div className="flex items-center justify-between gap-2">
          <Controller
            control={control}
            name={`scope.milestones.${index}.clientVisible`}
            render={({ field }) => (
              <button
                type="button"
                aria-pressed={field.value}
                onClick={() => field.onChange(!field.value)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  field.value
                    ? 'bg-success/10 text-success'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {field.value ? (
                  <Eye className="size-3.5" />
                ) : (
                  <EyeOff className="size-3.5" />
                )}
                {field.value ? 'Client sees this' : 'Internal only'}
              </button>
            )}
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            title={
              canRemove ? undefined : 'A project needs at least one milestone'
            }
            className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground inline-flex cursor-pointer items-center gap-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-3.5" />
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}
