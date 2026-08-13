import * as React from 'react'
import { CheckIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type Step = { label: string }

export type StepperDensity = 'default' | 'product'

function Stepper({
  steps,
  current,
  density = 'default',
  className,
  ...props
}: React.ComponentProps<'div'> & {
  steps: readonly Step[]
  current: number
  density?: StepperDensity
}) {
  const product = density === 'product'

  return (
    <div
      data-slot="stepper"
      className={cn(
        'flex scrollbar-none items-center overflow-auto',
        className
      )}
      {...props}
    >
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        const last = index === steps.length - 1
        return (
          <div
            key={step.label}
            className={cn(
              'flex items-center',
              !last || product ? 'flex-1' : 'flex-none'
            )}
          >
            <div
              className={cn(
                'flex shrink-0 items-center',
                product ? 'gap-2.25' : 'gap-2.5'
              )}
            >
              <span
                className={cn(
                  'flex size-6.5 shrink-0 items-center justify-center rounded-full font-semibold transition-colors',
                  product ? 'text-sm' : 'font-mono text-xs',
                  done && 'bg-success text-white',
                  active && 'bg-primary text-white',
                  !done && !active && 'bg-accent text-subtle-foreground'
                )}
              >
                {done && !product ? (
                  <CheckIcon className="size-3.25" strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'text-base whitespace-nowrap',
                  product ? 'font-semibold' : 'ds:inline hidden font-medium',
                  active ? 'text-foreground' : 'text-subtle-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {last ? null : (
              <span
                aria-hidden
                className={cn(
                  'mx-3 flex-1 transition-colors',
                  product ? 'h-0.5 rounded-[2px]' : 'h-px',
                  done ? 'bg-success' : 'bg-border'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export { Stepper }
