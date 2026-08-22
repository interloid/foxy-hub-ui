'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { Progress as ProgressPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

const fxProgressVariants = cva(
  'relative flex w-full items-center overflow-hidden rounded-full bg-muted',
  {
    variants: {
      size: {
        sm: 'h-1',
        default: 'h-1.5',
        lg: 'h-2.5',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

const fxProgressIndicatorVariants = cva(
  'size-full flex-1 transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        success: 'bg-success',
        warning: 'bg-warning',
        destructive: 'bg-destructive',
        info: 'bg-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface FxProgressProps
  extends
    React.ComponentProps<typeof ProgressPrimitive.Root>,
    VariantProps<typeof fxProgressVariants>,
    VariantProps<typeof fxProgressIndicatorVariants> {}

function FxProgress({
  className,
  value,
  size,
  variant,
  ...props
}: FxProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="fx-progress"
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      className={cn(fxProgressVariants({ size }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="fx-progress-indicator"
        className={cn(fxProgressIndicatorVariants({ variant }))}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { FxProgress, fxProgressVariants }
