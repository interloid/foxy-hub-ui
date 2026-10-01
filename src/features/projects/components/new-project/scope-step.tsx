'use client'

import { FxButton } from '@/components/shared/fx-button'
import {
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx-field'
import { FxTextarea } from '@/components/shared/fx-textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Plus, X } from 'lucide-react'
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form'
import {
  FieldHint,
  labelClass,
  SectionHeading,
  selectTriggerClass,
} from './form-fields'
import { MilestoneRow } from './milestone-row'
import { useNewProjectData } from './new-project-data-context'
import {
  EMPTY_MILESTONE,
  NO_SIGN_OFF,
  UPDATE_CADENCE_OPTIONS,
  type NewProjectWizardValues,
} from './schema'

const textareaClass = 'bg-muted min-h-24 text-[13px]'

export function ScopeStep() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<NewProjectWizardValues>()

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'scope.milestones',
  })

  const clientId = useWatch({ control, name: 'basics.clientId' })
  const milestones = useWatch({ control, name: 'scope.milestones' })
  const scopeErrors = errors.scope

  const { clients } = useNewProjectData()
  // Every client of the workspace, with the project's own client first. A company holds
  // one contact, so each option is that person - or the company, if it has no contact.
  // The label is what gets saved: `projects.sign_off_by` is text.
  const signOffOptions = [...clients]
    .sort((a, b) => Number(b.id === clientId) - Number(a.id === clientId))
    .map((client) => ({
      id: client.id,
      label: client.contactName
        ? `${client.contactName} · ${client.name}`
        : client.name,
    }))
  const namedCount = milestones.filter((m) => m.name.trim() !== '').length
  const milestonesError =
    scopeErrors?.milestones?.message ?? scopeErrors?.milestones?.root?.message

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHeading>Scope</SectionHeading>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          <FxField data-invalid={Boolean(scopeErrors?.inScope) || undefined}>
            <FxLabel
              htmlFor="inScope"
              className={`${labelClass} flex items-center gap-1.5`}
            >
              <Check className="text-success size-3.5" />
              What this covers
            </FxLabel>
            <FxTextarea
              id="inScope"
              placeholder="Strategy, content for Instagram and LinkedIn, monthly reporting..."
              className={textareaClass}
              {...register('scope.inScope')}
            />
            <FxFieldError errors={[scopeErrors?.inScope]} />
          </FxField>

          <FxField
            data-invalid={Boolean(scopeErrors?.outOfScope) || undefined}
            className={scopeErrors?.outOfScope ? undefined : 'pb-0'}
          >
            <FxLabel
              htmlFor="outOfScope"
              className={`${labelClass} flex items-center gap-1.5`}
            >
              <X className="text-destructive size-3.5" />
              What it does not
            </FxLabel>
            <FxTextarea
              id="outOfScope"
              placeholder="Paid media, community management, anything outside the two channels..."
              className={textareaClass}
              {...register('scope.outOfScope')}
            />
            {scopeErrors?.outOfScope ? (
              <FxFieldError errors={[scopeErrors.outOfScope]} />
            ) : (
              <FieldHint>
                Naming the exclusions is what turns a change request into a
                conversation instead of an argument.
              </FieldHint>
            )}
          </FxField>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Done & sign-off</SectionHeading>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <FxField data-invalid={Boolean(scopeErrors?.doneWhen) || undefined}>
            <FxLabel htmlFor="doneWhen" className={labelClass}>
              The client calls it done when...
            </FxLabel>
            <FxInput
              id="doneWhen"
              placeholder="e.g. Site live and handed over"
              className="h-10 text-[13px]"
              {...register('scope.doneWhen')}
            />
            <FxFieldError errors={[scopeErrors?.doneWhen]} />
          </FxField>

          <FxField>
            <FxLabel htmlFor="signOffBy" className={labelClass}>
              Who signs off
            </FxLabel>
            <Controller
              control={control}
              name="scope.signOffBy"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="signOffBy" className={selectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    sideOffset={6}
                    className="p-1"
                  >
                    <SelectItem
                      value={NO_SIGN_OFF}
                      className="cursor-pointer p-2 text-[13px]"
                    >
                      Not decided yet
                    </SelectItem>
                    {signOffOptions.map((option) => (
                      <SelectItem
                        key={option.id}
                        value={option.label}
                        className="cursor-pointer p-2 text-[13px]"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FxField>

          <FxField>
            <FxLabel htmlFor="updateCadence" className={labelClass}>
              Update cadence
            </FxLabel>
            <Controller
              control={control}
              name="scope.updateCadence"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="updateCadence"
                    className={selectTriggerClass}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    sideOffset={6}
                    className="p-1"
                  >
                    {UPDATE_CADENCE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="cursor-pointer p-2 text-[13px]"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FxField>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SectionHeading className="required-star">
              Milestones
            </SectionHeading>
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {namedCount} named
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            The client&apos;s timeline, and what delivery is measured against
          </p>
        </div>

        {fields.length > 0 && (
          <ol className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <MilestoneRow
                key={field.id}
                index={index}
                onRemove={() => remove(index)}
                canRemove={fields.length > 1}
              />
            ))}
          </ol>
        )}

        {milestonesError && (
          <p className="text-destructive text-xs">{milestonesError}</p>
        )}

        <FxButton
          type="button"
          variant="secondary"
          onClick={() => append({ ...EMPTY_MILESTONE })}
          className="w-fit gap-1.5 border-dashed"
        >
          <Plus className="size-4" />
          Add milestone
        </FxButton>
      </section>
    </div>
  )
}
