'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { ComponentProps } from 'react'

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
}: ComponentProps<'span'> & VariantProps<typeof fxSpinnerVariants>) {
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

export { FxSpinner, fxSpinnerVariants }
