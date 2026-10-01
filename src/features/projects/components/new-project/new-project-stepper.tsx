'use client'

import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { NEW_PROJECT_STEPS } from './constants'

interface NewProjectStepperProps {
  currentStep: number
  /** Whether the current step is valid - the same condition that enables "Next". */
  canAdvance: boolean
  onStepClick: (index: number) => void
}

export function NewProjectStepper({
  currentStep,
  canAdvance,
  onStepClick,
}: NewProjectStepperProps) {
  return (
    <ol className="flex flex-col gap-2.5">
      {NEW_PROJECT_STEPS.map((step, index) => {
        const isActive = index === currentStep
        const isComplete = index < currentStep
        // The step right after the current one opens like "Next" once this step is valid.
        // Steps further ahead stay locked, so no step is ever skipped.
        const isNextAvailable = index === currentStep + 1 && canAdvance
        const isClickable = isComplete || isNextAvailable

        return (
          <li key={step.id}>
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => onStepClick(index)}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'bg-card border-border flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                isActive && 'border-primary bg-primary/10',
                isClickable && 'hover:bg-muted cursor-pointer'
              )}
            >
              <span
                className={cn(
                  'bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  isActive && 'bg-primary text-primary-foreground',
                  isComplete && 'bg-primary/15 text-primary'
                )}
              >
                {isComplete ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="text-foreground block text-[13px] font-semibold">
                  {step.title}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {step.description}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
