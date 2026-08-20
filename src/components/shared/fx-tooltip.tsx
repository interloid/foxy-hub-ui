'use client'

import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { ComponentProps } from 'react'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function FxTooltip({ ...props }: ComponentProps<typeof Tooltip>) {
  return <Tooltip data-slot="fx-tooltip" {...props} />
}

function FxTooltipTrigger({ ...props }: ComponentProps<typeof TooltipTrigger>) {
  return <TooltipTrigger data-slot="fx-tooltip-trigger" {...props} />
}

function FxTooltipContent({
  className,
  sideOffset = 6,
  showArrow = true,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content> & {
  showArrow?: boolean
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="fx-tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-tooltip text-tooltip-foreground border-tooltip-border shadow-panel z-50 w-fit max-w-xs rounded-md border px-2.5 py-1.5 text-xs font-medium',
          'origin-(--radix-tooltip-content-transform-origin)',
          'data-[state=delayed-open]:animate-fx-fade data-open:animate-fx-fade',
          className
        )}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow className="bg-tooltip fill-tooltip z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { FxTooltip, FxTooltipContent, FxTooltipTrigger }
