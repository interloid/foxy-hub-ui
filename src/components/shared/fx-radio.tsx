'use client'

import * as React from 'react'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

function FxRadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroup>) {
  return (
    <RadioGroup
      data-slot="fx-radio-group"
      className={cn('gap-0', className)}
      {...props}
    />
  )
}

function FxRadioItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupItem>) {
  return (
    <RadioGroupItem
      data-slot="fx-radio-item"
      className={cn(
        'border-border-strong bg-muted dark:bg-muted data-checked:border-primary data-checked:bg-muted dark:data-checked:bg-muted [&_[data-slot=radio-group-indicator]>span]:bg-primary size-4.5',
        className
      )}
      {...props}
    />
  )
}

function FxRadioCard({
  className,
  checked = false,
  children,
  ...props
}: React.ComponentProps<'label'> & { checked?: boolean }) {
  return (
    <label
      data-slot="fx-radio-card"
      data-checked={checked || undefined}
      className={cn(
        'border-border bg-card data-checked:border-primary data-checked:bg-primary-subtle flex cursor-pointer items-start gap-3 rounded-xl border p-[13px] transition-colors duration-(--duration-fast)',
        className
      )}
      {...props}
    >
      {children}
    </label>
  )
}

export { FxRadioGroup, FxRadioItem, FxRadioCard }
