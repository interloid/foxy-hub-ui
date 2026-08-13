'use client'

import * as React from 'react'

import { TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function FxTooltipContent({
  className,
  ...props
}: React.ComponentProps<typeof TooltipContent>) {
  return (
    <TooltipContent
      data-slot="fx-tooltip-content"
      sideOffset={7}
      className={cn(
        'border-border bg-popover text-popover-foreground shadow-panel rounded-md border px-2.5 py-1.5 text-sm [&_svg]:hidden',
        className
      )}
      {...props}
    />
  )
}

export { FxTooltipContent }
export {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
