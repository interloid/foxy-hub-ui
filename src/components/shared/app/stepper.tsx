'use client'

import * as React from 'react'
import { CheckIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type Step = { label: string }

export type StepperDensity = 'default' | 'product'

function Stepper({
  steps,
  current,
  density = 'default',
  autoScrollActive = true,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  steps: readonly Step[]
  current: number
  density?: StepperDensity
  /** Keep the active step centred whenever the rail overflows. */
  autoScrollActive?: boolean
}) {
  const product = density === 'product'
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const mounted = React.useRef(false)

  React.useEffect(() => {
    const scroller = scrollerRef.current
    const item = itemRefs.current[current]
    const first = !mounted.current
    mounted.current = true
    if (!autoScrollActive || !scroller || !item) return
    // Desktop fits every step, so there is nothing to centre. This check IS the
    // mobile gate: it fires exactly when the rail is actually clipped, which
    // stays true for long labels and longer flows without a breakpoint to sync.
    if (scroller.scrollWidth <= scroller.clientWidth) return

    // Rect deltas, not offsetLeft — the scroller is not a positioned ancestor,
    // so offsetLeft would measure against the wrong box and mis-centre.
    const box = scroller.getBoundingClientRect()
    const target = item.getBoundingClientRect()
    const left = target.left + target.width / 2 - (box.left + box.width / 2)
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    // scrollBy on the rail, never scrollIntoView: the latter also scrolls
    // ancestors, and the pages that host this one scroll vertically.
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
          <div
            key={step.label}
            className={cn(
              'flex items-center',
              !last || product ? 'flex-1' : 'flex-none'
            )}
          >
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
