'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const fxSpinnerVariants = cva(
  'inline-block rounded-full border-border-strong border-t-primary animate-fx-spin',
  {
    variants: {
      spinnerSize: {
        default: 'size-[34px] border-[3px]',
        sm: 'size-4 border-2',
      },
    },
    defaultVariants: {
      spinnerSize: 'default',
    },
  }
)

function FxSpinner({
  className,
  spinnerSize,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof fxSpinnerVariants>) {
  return (
    <span
      data-slot="fx-spinner"
      role="status"
      aria-label="Loading"
      data-size={spinnerSize ?? 'default'}
      className={cn(fxSpinnerVariants({ spinnerSize }), className)}
      {...props}
    />
  )
}

export { FxSpinner, fxSpinnerVariants }
