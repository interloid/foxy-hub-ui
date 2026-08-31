'use client'

import { cn } from '@/lib/utils'
import { CheckIcon } from 'lucide-react'
import { ComponentProps, Fragment, useEffect, useRef } from 'react'

export type Step = { label: string }

export type StepperDensity = 'default' | 'product'

function Stepper({
  steps,
  current,
  density = 'default',
  autoScrollActive = true,
  className,
  ...props
}: ComponentProps<'div'> & {
  steps: readonly Step[]
  current: number
  density?: StepperDensity
  autoScrollActive?: boolean
}) {
  const product = density === 'product'
  const scrollerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const mounted = useRef<boolean>(false)

  useEffect(() => {
    const scroller = scrollerRef.current
    const item = itemRefs.current[current]
    const first = !mounted.current
    mounted.current = true
    if (!autoScrollActive || !scroller || !item) return

    if (scroller.scrollWidth <= scroller.clientWidth) return

    const box = scroller.getBoundingClientRect()
    const target = item.getBoundingClientRect()
    const left = target.left + target.width / 2 - (box.left + box.width / 2)
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    scroller.scrollBy({ left, behavior: first || reduced ? 'auto' : 'smooth' })
  }, [current, autoScrollActive])

  return (
    <div
      ref={scrollerRef}
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
          <Fragment key={step.label}>
            <div
              ref={(node) => {
                itemRefs.current[index] = node
              }}
              className={cn(
                'flex shrink-0 items-center',
                product ? 'gap-2.25' : 'gap-2.5'
              )}
            >
              <span
                className={cn(
                  'flex size-6.5 shrink-0 items-center justify-center rounded-full font-semibold transition-colors',
                  product ? 'text-sm' : 'font-mono text-xs',
                  done && 'bg-success text-brand-white',
                  active && 'bg-primary',
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
            {!last && (
              <span
                aria-hidden
                className={cn(
                  'mx-3 min-w-6 flex-1 transition-colors',
                  product ? 'h-0.5 rounded-xs' : 'h-px',
                  done ? 'bg-success' : 'bg-border'
                )}
              />
            )}
          </Fragment>
        )
      })}

      {product && <span aria-hidden className="min-w-6 flex-1" />}
    </div>
  )
}

export { Stepper }
