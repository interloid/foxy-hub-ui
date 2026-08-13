'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { SelectTrigger } from '@/components/ui/select'
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

function FxTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="fx-textarea"
      className={cn(
        fxInputVariants({ inputSize: 'default' }),
        'min-h-[84px] resize-y leading-relaxed',
        className
      )}
      {...props}
    />
  )
}

/** 12.5px / 600 / muted. `ui/label.tsx` is already `text-sm`, which is 12.5px here. */
function FxLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="fx-label"
      className={cn('text-muted-foreground font-semibold', className)}
      {...props}
    />
  )
}

function FxSelectTrigger({
  className,
  inputSize,
  ...props
}: React.ComponentProps<typeof SelectTrigger> &
  VariantProps<typeof fxInputVariants>) {
  return (
    <SelectTrigger
      data-slot="fx-select-trigger"
      className={cn(
        'border-border bg-muted data-placeholder:text-subtle-foreground dark:bg-muted h-auto w-full focus-visible:ring-0 data-[size=default]:h-auto data-[size=sm]:h-auto',
        fxInputVariants({ inputSize }),
        inputSize === 'sm' && 'data-[size=sm]:rounded-md',
        className
      )}
      {...props}
    />
  )
}

/** 18px, radius-sm (6px), on `--muted`; border-only focus like every other field. */
function FxCheckbox({
  className,
  ...props
}: React.ComponentProps<typeof Checkbox>) {
  return (
    <Checkbox
      data-slot="fx-checkbox"
      className={cn(
        'border-border bg-muted dark:bg-muted size-[18px] rounded-sm focus-visible:ring-0',
        className
      )}
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

export {
  FxInput,
  FxTextarea,
  FxLabel,
  FxSelectTrigger,
  FxCheckbox,
  FxField,
  FxFieldError,
  fxInputVariants,
}
