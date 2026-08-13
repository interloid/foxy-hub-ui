'use client'

import * as React from 'react'

import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

import { FxInput } from './fx-field'

function FxInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      data-slot="fx-input-group"
      className={cn(
        'border-border bg-muted dark:bg-muted h-auto overflow-hidden rounded-lg has-[[data-slot=input-group-control]:focus-visible]:ring-0',
        className
      )}
      {...props}
    />
  )
}

/** Prefix / suffix. `align` decides which edge carries the rule, matching v2's two uses. */
function FxInputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<typeof InputGroupAddon>) {
  return (
    <InputGroupAddon
      data-slot="fx-input-group-addon"
      align={align}
      className={cn(
        'border-border text-subtle-foreground shrink-0 self-stretch px-3 py-2.75 font-mono text-base font-normal whitespace-nowrap',
        align === 'inline-end' ? 'border-l' : 'border-r',
        className
      )}
      {...props}
    />
  )
}

function FxInputGroupInput({
  className,
  ...props
}: React.ComponentProps<typeof FxInput>) {
  return (
    <FxInput
      data-slot="input-group-control"
      className={cn(
        'rounded-none border-0 bg-transparent focus-visible:border-transparent',
        className
      )}
      {...props}
    />
  )
}

export { FxInputGroup, FxInputGroupAddon, FxInputGroupInput }
