import * as React from 'react'

import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

function FxKbd({ className, ...props }: React.ComponentProps<typeof Kbd>) {
  return (
    <Kbd
      data-slot="fx-kbd"
      className={cn(
        'border-border bg-accent text-2xs text-subtle-foreground h-auto min-w-0 rounded-sm border px-1.5 py-px font-mono font-normal',
        className
      )}
      {...props}
    />
  )
}

export { FxKbd }
