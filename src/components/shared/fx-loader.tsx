'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/** Route-load skeleton: a card-coloured gradient sliding across `--muted`. */
function FxSheen({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="fx-sheen"
      className={cn(
        'animate-fx-sheen rounded-md bg-[linear-gradient(90deg,var(--muted)_25%,var(--accent)_50%,var(--muted)_75%)] bg-[length:200%_100%]',
        className
      )}
      {...props}
    />
  )
}

/** Streaming-text placeholder: staggered 11px bars on `--muted`, radius-sm. */
function FxPulseLines({
  lines = 4,
  className,
  ...props
}: React.ComponentProps<'div'> & { lines?: number }) {
  const widths = ['100%', '92%', '78%', '85%']
  return (
    <div
      data-slot="fx-pulse-lines"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="animate-fx-pulse bg-muted h-[11px] rounded-sm"
          style={{
            width: widths[i % widths.length],
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}

/** Blocking work: 34px ring, 3px `--border-strong` with a `--primary` top edge. */
const fxSpinnerVariants = cva(
  'animate-fx-spin inline-block rounded-full border-border-strong border-t-primary',
  {
    variants: {
      spinnerSize: {
        default: 'size-[34px] border-[3px]',
        sm: 'size-4 border-2',
      },
    },
    defaultVariants: { spinnerSize: 'default' },
  }
)

function FxSpinner({
  className,
  spinnerSize,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof fxSpinnerVariants>) {
  return (
    <span
      data-slot="fx-spinner"
      role="status"
      aria-label="Loading"
      className={cn(fxSpinnerVariants({ spinnerSize }), className)}
      {...props}
    />
  )
}

/**
 * Determinate progress. Track is **`--accent`** (v2 moved it off `--muted`), 8px, fully round.
 * `tone` colours the fill by meaning — the design uses all four.
 */
const FX_PROGRESS_TONE = {
  primary: '*:data-[slot=progress-indicator]:bg-primary',
  success: '*:data-[slot=progress-indicator]:bg-success',
  warning: '*:data-[slot=progress-indicator]:bg-warning',
  destructive: '*:data-[slot=progress-indicator]:bg-destructive',
} as const

function FxProgress({
  className,
  tone = 'primary',
  ...props
}: React.ComponentProps<typeof Progress> & {
  tone?: keyof typeof FX_PROGRESS_TONE
}) {
  return (
    <Progress
      data-slot="fx-progress"
      className={cn(
        'bg-accent h-2 rounded-full',
        FX_PROGRESS_TONE[tone],
        className
      )}
      {...props}
    />
  )
}

export { FxProgress, FxPulseLines, FxSheen, FxSpinner, fxSpinnerVariants }
