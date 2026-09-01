'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxInput } from '@/components/shared/fx-field'
import { TeamMemberOption } from '@/features/dashboard/actions'
import { AlertTriangle, Plus } from 'lucide-react'
import {
  Control,
  FieldArrayWithId,
  UseFormRegister,
  UseFormSetValue,
} from 'react-hook-form'

import { TeamAllocationRow } from './team-allocation-row'
import { AllocationFormValues, NewProjectFormValues } from './types'

interface OverCommittedDetails {
  memberName: string
  totalHours: number
  maxCapacity: number
}

interface TeamAllocationSectionProps {
  fields: FieldArrayWithId<NewProjectFormValues, 'allocations', 'id'>[]
  allocations: AllocationFormValues[]
  teamMembers: TeamMemberOption[]
  isLoadingTeam: boolean
  maxCapacity: number
  orgMaxDaysPerWk: number
  isOverCommitted: boolean
  overCommittedDetails: OverCommittedDetails | null
  control: Control<NewProjectFormValues>
  register: UseFormRegister<NewProjectFormValues>
  setValue: UseFormSetValue<NewProjectFormValues>
  remove: (index: number) => void
  onAddTeammate: () => void
  checkCapacityForUser: (userId: string, dateStr?: string) => void
}

export function TeamAllocationSection({
  fields,
  allocations,
  teamMembers,
  isLoadingTeam,
  maxCapacity,
  orgMaxDaysPerWk,
  isOverCommitted,
  overCommittedDetails,
  control,
  register,
  setValue,
  remove,
  onAddTeammate,
  checkCapacityForUser,
}: TeamAllocationSectionProps) {
  const isAddDisabled = isLoadingTeam || teamMembers.length === 0

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-foreground text-[13px] font-medium">
          Team allocation
        </label>
        <FxButton
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddTeammate}
          disabled={isAddDisabled}
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
          <TeamAllocationRow
            key={fieldItem.id}
            index={index}
            currentAllocation={currentAllocation}
            isSingleRow={isSingleRow}
            teamMembers={teamMembers}
            isLoadingTeam={isLoadingTeam}
            maxCapacity={maxCapacity}
            orgMaxDaysPerWk={orgMaxDaysPerWk}
            control={control}
            register={register}
            setValue={setValue}
            remove={remove}
            checkCapacityForUser={checkCapacityForUser}
          />
        )
      })}

      <p className="text-muted-foreground text-[11.5px] leading-snug">
        Part-time is first-class — set any hours/day. Rates snapshot onto each
        time entry; a change over time is a new dated row.
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
              — this allocation pushes someone past a standard working day:
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
              Owner override reason <span className="text-destructive">*</span>
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
  )
}
