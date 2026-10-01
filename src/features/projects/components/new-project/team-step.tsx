'use client'

import { FxButton } from '@/components/shared/fx-button'
import {
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx-field'
import { FxTextarea } from '@/components/shared/fx-textarea'
import { AlertTriangle, Plus } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'
import { AllocationRow } from './allocation-row'
import { getOverCommitments } from './capacity'
import { labelClass } from './form-fields'
import { useNewProjectData } from './new-project-data-context'
import type { AllocationValues, NewProjectWizardValues } from './schema'
import type { NewProjectMember } from './types'

export function TeamStep() {
  const {
    register,
    control,
    getValues,
    formState: { errors },
  } = useFormContext<NewProjectWizardValues>()

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'team.allocations',
  })

  const { members, existingHours, dailyCapacityHours, daysPerWeek } =
    useNewProjectData()
  const allocations = useWatch({ control, name: 'team.allocations' })
  const overCommitments = getOverCommitments(
    allocations,
    existingHours,
    members,
    dailyCapacityHours
  )
  const teamErrors = errors.team

  const handleAddTeammate = () => {
    // Suggest the first teammate not on the project yet.
    const taken = new Set(allocations.map((row) => row.memberId))
    const member = members.find((m) => !taken.has(m.id))
    if (!member) return

    append(
      createAllocation(member, daysPerWeek, getValues('basics.kickoffDate'))
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className={`${labelClass} text-foreground mb-0`}>Team allocation</p>
        <FxButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAddTeammate}
          // Everyone is already on the project - there is no one left to add.
          disabled={allocations.length >= members.length}
          className="h-8 gap-1.5 text-[13px]"
        >
          <Plus className="size-4" />
          Add teammate
        </FxButton>
      </div>

      {fields.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <AllocationRow
              key={field.id}
              index={index}
              onRemove={() => remove(index)}
              canRemove={fields.length > 1}
            />
          ))}
        </ul>
      ) : (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-[13px]">
          No one is on this project yet. Add a teammate to plan capacity.
        </p>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Part-time is first-class - set any hours/day.{' '}
        <strong className="text-foreground font-semibold">Bill rate</strong> is
        what the client is charged;{' '}
        <strong className="text-foreground font-semibold">cost rate</strong> is
        what this person is paid, and it never appears on an invoice or to a
        contributor. Both snapshot onto each time entry; a change over time is a
        new dated row.
      </p>

      {overCommitments.length > 0 && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 flex flex-col gap-3 rounded-lg border p-3.5"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
            <div className="space-y-1 text-[13px]">
              <p className="text-foreground">
                <span className="font-semibold">Over-commitment blocked</span> -
                this allocation pushes someone past a standard working day:
              </p>
              <ul className="space-y-0.5">
                {overCommitments.map((item) => (
                  <li key={item.memberId} className="text-foreground">
                    {item.name} →{' '}
                    <span className="font-mono font-semibold">
                      {item.totalHoursPerDay} h/day
                    </span>{' '}
                    <span className="text-muted-foreground">
                      (max {item.maxHoursPerDay}h)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <FxField
            data-invalid={Boolean(teamErrors?.overrideReason) || undefined}
          >
            <FxLabel
              htmlFor="overrideReason"
              className={`${labelClass} required-star text-xs`}
            >
              Owner override reason
            </FxLabel>
            <FxInput
              id="overrideReason"
              placeholder="Why is this over-commitment acceptable?"
              className="bg-card h-10 text-[13px]"
              aria-invalid={Boolean(teamErrors?.overrideReason) || undefined}
              {...register('team.overrideReason')}
            />
            <FxFieldError errors={[teamErrors?.overrideReason]} />
          </FxField>
        </div>
      )}

      <FxField data-invalid={Boolean(teamErrors?.deliveryNotes) || undefined}>
        <FxLabel htmlFor="deliveryNotes" className={labelClass}>
          Notes for delivery (optional)
        </FxLabel>
        <FxTextarea
          id="deliveryNotes"
          placeholder="Scope, goals, key deliverables..."
          className="bg-muted min-h-20 text-[13px]"
          {...register('team.deliveryNotes')}
        />
        <FxFieldError errors={[teamErrors?.deliveryNotes]} />
      </FxField>
    </div>
  )
}

export function createAllocation(
  member: NewProjectMember,
  daysPerWeek: number,
  kickoffDate?: Date
): AllocationValues {
  return {
    memberId: member.id,
    hoursPerDay: '8',
    daysPerWeek: String(daysPerWeek),
    billRate: member.defaultRate !== null ? String(member.defaultRate) : '',
    effectiveFrom: kickoffDate ?? new Date(),
  }
}
