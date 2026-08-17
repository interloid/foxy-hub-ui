'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Field, FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const fxInputVariants = cva(
  'w-full min-w-0 border border-border bg-muted text-foreground transition-colors duration-(--duration-fast) outline-none placeholder:text-subtle-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
  {
    variants: {
      inputSize: {
        default: 'rounded-lg px-[13px] py-[11px] text-md',
        sm: 'rounded-md px-2.5 py-2 text-base',
      },
    },
    defaultVariants: { inputSize: 'default' },
  }
)

function FxInput({
  className,
  inputSize,
  type,
  ...props
}: React.ComponentProps<'input'> & VariantProps<typeof fxInputVariants>) {
  return (
    <input
      type={type}
      data-slot="fx-input"
      className={cn(fxInputVariants({ inputSize }), className)}
      {...props}
    />
  )
}

function FxLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="fx-label"
      className={cn('text-muted-foreground font-semibold', className)}
      {...props}
    />
  )
}

function FxField({ className, ...props }: React.ComponentProps<typeof Field>) {
  return (
    <Field
      data-slot="fx-field"
      className={cn('gap-1.5', className)}
      {...props}
    />
  )
}

function FxFieldError({
  className,
  ...props
}: React.ComponentProps<typeof FieldError>) {
  return (
    <FieldError data-slot="fx-field-error" className={className} {...props} />
  )
}

export { FxInput, FxLabel, FxField, FxFieldError, fxInputVariants }
