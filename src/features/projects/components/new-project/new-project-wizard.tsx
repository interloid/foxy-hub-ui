'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { createProjectFromWizard } from '@/features/projects/create-project-action'
import { isProjectOwnerRole } from '@/lib/role'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { BasicsStep } from './basics-step'
import { BillingStep } from './billing-step'
import { getOverCommitments } from './capacity'
import { NEW_PROJECT_STEPS, type NewProjectStepId } from './constants'
import { NewProjectDataProvider } from './new-project-data-context'
import { NewProjectStepper } from './new-project-stepper'
import { toCreateProjectPayload } from './payload'
import {
  EMPTY_MILESTONE,
  hasBillRate,
  newProjectWizardSchema,
  NO_SIGN_OFF,
  requiresBillRate,
  resolveEffectiveTo,
  type NewProjectWizardValues,
} from './schema'
import { ScopeStep } from './scope-step'
import { createAllocation, TeamStep } from './team-step'
import type { NewProjectFormData } from './types'
import { useExistingHours } from './use-existing-hours'

interface NewProjectWizardProps {
  orgSlug: string
  data: NewProjectFormData
}

// The form section each step validates before moving on.
const STEP_FORM_KEY: Record<NewProjectStepId, keyof NewProjectWizardValues> = {
  basics: 'basics',
  scope: 'scope',
  billing: 'billing',
  team: 'team',
}

function StepContent({ stepId }: { stepId: NewProjectStepId }) {
  switch (stepId) {
    case 'basics':
      return <BasicsStep />
    case 'scope':
      return <ScopeStep />
    case 'billing':
      return <BillingStep />
    case 'team':
      return <TeamStep />
  }
}

export function NewProjectWizard({ orgSlug, data }: NewProjectWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isCreating, startCreating] = useTransition()
  const projectsHref = `/${orgSlug}/projects`

  const defaultTeammate =
    data.members.find((m) => m.id === data.currentUserId) ?? data.members[0]

  const form = useForm<NewProjectWizardValues>({
    resolver: zodResolver(newProjectWizardSchema),
    mode: 'onBlur',
    defaultValues: {
      basics: {
        projectName: '',
        clientId: undefined,
        // Whoever is setting it up owns it until they pick someone else.
        ownerId: data.members.some(
          (m) => m.id === data.currentUserId && isProjectOwnerRole(m.role)
        )
          ? data.currentUserId
          : undefined,
        kickoffDate: undefined,
        targetEndDate: undefined,
      },
      scope: {
        inScope: '',
        outOfScope: '',
        doneWhen: '',
        signOffBy: NO_SIGN_OFF,
        updateCadence: 'weekly_monday',
        milestones: [{ ...EMPTY_MILESTONE }],
      },
      billing: {
        model: 'budget',
        contractValue: '',
        estimatedHours: '',
        budgetCap: '',
        retainerFee: '',
        retainerPeriod: 'monthly',
        retainerHours: '',
        retainerOverage: '',
      },
      team: {
        // Start with one row - you, if you're on the team list, otherwise the first person.
        allocations: defaultTeammate
          ? [createAllocation(defaultTeammate, data.daysPerWeek)]
          : [],
        overrideReason: '',
        deliveryNotes: '',
      },
    },
  })

  const allocations = useWatch({
    control: form.control,
    name: 'team.allocations',
  })
  const existingHours = useExistingHours(orgSlug, allocations)

  const step = NEW_PROJECT_STEPS[currentStep]
  const isLastStep = currentStep === NEW_PROJECT_STEPS.length - 1

  const values = useWatch({ control: form.control })
  const stepKey = STEP_FORM_KEY[step.id]
  const stepCheck = newProjectWizardSchema.shape[stepKey].safeParse(
    values[stepKey]
  )
  const needsOverrideReason =
    step.id === 'team' &&
    !values.team?.overrideReason?.trim() &&
    getOverCommitments(
      allocations,
      existingHours,
      data.members,
      data.dailyCapacityHours
    ).length > 0
  const unratedIndex =
    step.id === 'team' && requiresBillRate(values.billing?.model)
      ? allocations.findIndex((row) => !hasBillRate(row.billRate))
      : -1
  const unratedName =
    unratedIndex >= 0
      ? (data.members.find((m) => m.id === allocations[unratedIndex].memberId)
          ?.name ?? 'every teammate')
      : null
  const targetEndDate = values.basics?.targetEndDate
  const endsTooEarly =
    step.id === 'team'
      ? allocations.find((row) => {
          const end = resolveEffectiveTo(row, targetEndDate)
          return end !== null && row.effectiveFrom && end <= row.effectiveFrom
        })
      : undefined
  const blockingIssue = !stepCheck.success
    ? (stepCheck.error.issues[0]?.message ?? 'Fix the highlighted fields')
    : endsTooEarly
      ? `Effective to must be after effective from for ${
          data.members.find((m) => m.id === endsTooEarly.memberId)?.name ??
          'a teammate'
        }`
      : unratedName
        ? `Add a bill rate for ${unratedName} - Hourly bills every hour at it`
        : needsOverrideReason
          ? 'Add an owner override reason for the over-commitment'
          : null
  const isStepValid = blockingIssue === null

  const handleNext = async () => {
    const isValid = await form.trigger(stepKey, {
      shouldFocus: true,
    })
    if (!isValid) return

    if (isLastStep) {
      const { allocations, overrideReason } = form.getValues('team')
      const overCommitments = getOverCommitments(
        allocations,
        existingHours,
        data.members,
        data.dailyCapacityHours
      )
      if (overCommitments.length > 0 && overrideReason.trim() === '') {
        form.setError(
          'team.overrideReason',
          { message: 'Explain why this over-commitment is acceptable' },
          { shouldFocus: true }
        )
        return
      }

      const payload = toCreateProjectPayload(form.getValues())
      startCreating(async () => {
        const res = await createProjectFromWizard(orgSlug, payload)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success('Project created')
        router.push(`/${orgSlug}/projects/${res.data.projectId}`)
      })
      return
    }

    const nextStep = NEW_PROJECT_STEPS[currentStep + 1]
    if (nextStep.id === 'team') {
      // Allocations can't start before kickoff; pull any earlier rows forward to it.
      const kickoffDate = form.getValues('basics.kickoffDate')
      form.getValues('team.allocations').forEach((row, index) => {
        if (kickoffDate && row.effectiveFrom < kickoffDate) {
          form.setValue(`team.allocations.${index}.effectiveFrom`, kickoffDate)
        }
      })
    }

    setCurrentStep((prev) => prev + 1)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={projectsHref}
          className="text-muted-foreground hover:text-foreground duration-fast inline-flex items-center gap-1.5 text-[13px] transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          All projects
        </Link>
        <span className="text-muted-foreground/60 text-[13px]">/</span>
        <h1 className="text-foreground text-[22px]! font-medium tracking-tight">
          New project
        </h1>
        <span className="text-muted-foreground text-[13px]">
          Nothing is created until the last step
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[240px_1fr]">
        <NewProjectStepper
          currentStep={currentStep}
          canAdvance={isStepValid && !isCreating}
          // Going back just switches step; going forward runs the same path as "Next" so
          // validation and the kickoff-date adjustment for team rows still happen.
          onStepClick={(index) =>
            index > currentStep ? handleNext() : setCurrentStep(index)
          }
        />

        <div className="flex flex-col gap-4">
          <FxCard className="rounded-xl">
            <FxCardContent className="p-5">
              <NewProjectDataProvider value={{ ...data, existingHours }}>
                <FormProvider {...form}>
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleNext()
                    }}
                  >
                    <StepContent stepId={step.id} />
                  </form>
                </FormProvider>
              </NewProjectDataProvider>
            </FxCardContent>
          </FxCard>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {blockingIssue ? (
              <p
                role="status"
                className="text-muted-foreground flex max-w-80 items-start gap-1.5 text-xs leading-relaxed"
              >
                <AlertCircle className="text-warning mt-0.5 size-3.5 shrink-0" />
                <span>
                  To continue:{' '}
                  <span className="text-foreground">{blockingIssue}</span>
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground max-w-72 text-xs leading-relaxed">
                {step.footerHint}
              </p>
            )}
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <FxButton
                  type="button"
                  variant="secondary"
                  onClick={() => setCurrentStep((prev) => prev - 1)}
                >
                  Back
                </FxButton>
              )}
              <FxButton
                type="button"
                variant="secondary"
                onClick={() => router.push(projectsHref)}
              >
                Cancel
              </FxButton>
              <FxButton
                type="button"
                onClick={handleNext}
                disabled={!isStepValid || isCreating}
                className="gap-1.5"
              >
                {isLastStep && <Plus className="size-4" />}
                {isCreating ? 'Creating...' : step.nextLabel}
                {!isLastStep && <ArrowRight className="size-4" />}
              </FxButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
