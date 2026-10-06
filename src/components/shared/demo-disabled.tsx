'use client'

import { cloneElement, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

import {
  FxTooltip,
  FxTooltipContent,
  FxTooltipTrigger,
} from '@/components/shared/fx-tooltip'
import { DEMO_DISABLED_MESSAGE } from '@/features/auth/demo'
import { useIsDemo } from '@/features/dashboard/context/workspace-context'

/**
 * Wraps a control that is turned off in the shared demo workspace. Outside the demo it
 * renders the child untouched; inside, the child is disabled and explains why on hover
 * and focus. The server action refuses the change as well - this is only the signpost.
 *
 *   <DemoDisabled><FxButton onClick={invite}>Invite</FxButton></DemoDisabled>
 */
export function DemoDisabled({
  children,
  message = DEMO_DISABLED_MESSAGE,
  className,
}: {
  children: ReactElement<{ disabled?: boolean }>
  message?: string
  /** For the wrapper, e.g. `flex w-full` around a full-width button. */
  className?: string
}) {
  const isDemo = useIsDemo()
  if (!isDemo) return children

  return (
    <FxTooltip>
      <FxTooltipTrigger asChild>
        {/* A disabled button fires no pointer events, so the tooltip hangs off a
            focusable wrapper instead. */}
        <span
          tabIndex={0}
          className={cn('inline-flex cursor-not-allowed', className)}
        >
          {cloneElement(children, { disabled: true })}
        </span>
      </FxTooltipTrigger>
      <FxTooltipContent>{message}</FxTooltipContent>
    </FxTooltip>
  )
}
