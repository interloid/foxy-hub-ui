'use client'

import {
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isProjectOwnerRole } from '@/lib/role'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import {
  DateField,
  FieldHint,
  labelClass,
  selectTriggerClass,
} from './form-fields'
import { useNewProjectData } from './new-project-data-context'
import type { NewProjectWizardValues } from './schema'

export function BasicsStep() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<NewProjectWizardValues>()
  const { clients, members } = useNewProjectData()
  const owners = members.filter((m) => isProjectOwnerRole(m.role))

  const kickoffDate = useWatch({ control, name: 'basics.kickoffDate' })
  const basicsErrors = errors.basics

  return (
    <div className="flex flex-col gap-3">
      <FxField data-invalid={Boolean(basicsErrors?.projectName) || undefined}>
        <FxLabel
          htmlFor="projectName"
          className={`${labelClass} required-star`}
        >
          Project name
        </FxLabel>
        <FxInput
          id="projectName"
          type="text"
          placeholder="e.g. Nordwave Packaging Refresh"
          className="h-10 text-[13px]"
          aria-invalid={Boolean(basicsErrors?.projectName) || undefined}
          {...register('basics.projectName')}
        />
        <FxFieldError errors={[basicsErrors?.projectName]} />
      </FxField>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
        <FxField>
          <FxLabel htmlFor="clientId" className={labelClass}>
            Client
          </FxLabel>
          <Controller
            control={control}
            name="basics.clientId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="clientId" className={selectTriggerClass}>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="p-1"
                >
                  {clients.length === 0 && (
                    <p className="text-muted-foreground p-2 text-[13px]">
                      No clients in this workspace yet
                    </p>
                  )}
                  {clients.map((client) => (
                    <SelectItem
                      key={client.id}
                      value={client.id}
                      className="cursor-pointer p-2 text-[13px]"
                    >
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FxField>

        <FxField className="pb-0">
          <FxLabel htmlFor="ownerId" className={labelClass}>
            Project owner
          </FxLabel>
          <Controller
            control={control}
            name="basics.ownerId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ownerId" className={selectTriggerClass}>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="p-1"
                >
                  {owners.map((owner) => (
                    <SelectItem
                      key={owner.id}
                      value={owner.id}
                      className="cursor-pointer p-2 text-[13px]"
                    >
                      {owner.name} · {owner.roleLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldHint>
            Timesheets and invoices on this project route to them.
          </FieldHint>
        </FxField>

        <Controller
          control={control}
          name="basics.kickoffDate"
          render={({ field, fieldState }) => (
            <DateField
              id="kickoffDate"
              label="Kickoff date"
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error}
            />
          )}
        />

        <Controller
          control={control}
          name="basics.targetEndDate"
          render={({ field, fieldState }) => (
            <DateField
              id="targetEndDate"
              label="Target end date"
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error}
              hint="These two dates are what the schedule half of project health measures against."
              disabled={(date) => (kickoffDate ? date < kickoffDate : false)}
            />
          )}
        />
      </div>
    </div>
  )
}
