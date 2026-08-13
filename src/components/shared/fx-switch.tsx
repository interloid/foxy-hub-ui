'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function FxSwitch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="fx-switch"
      className={cn(
        'border-border bg-accent focus-visible:ring-ring focus-visible:ring-offset-background data-checked:border-primary data-checked:bg-primary inline-flex h-5.5 w-9.5 shrink-0 items-center rounded-full border p-px transition-colors duration-(--duration-fast) outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="fx-switch-thumb"
        className="bg-card shadow-card pointer-events-none block size-4.5 translate-x-0 rounded-full transition-transform duration-(--duration-fast) data-checked:translate-x-4 data-checked:bg-white"
      />
    </SwitchPrimitive.Root>
  )
}

export { FxSwitch }
