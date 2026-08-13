import * as React from 'react'

import { cn } from '@/lib/utils'

const FX_TOAST_TONE = {
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const

function FxToastSpecimen({
  className,
  tone = 'success',
  children,
  ...props
}: React.ComponentProps<'div'> & { tone?: keyof typeof FX_TOAST_TONE }) {
  return (
    <div
      data-slot="fx-toast-specimen"
      className={cn(
        'animate-fx-slide border-border-strong bg-popover shadow-panel flex items-center gap-2.25 rounded-xl border px-3.5 py-2.75 text-base',
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn('size-1.75 shrink-0 rounded-full', FX_TOAST_TONE[tone])}
      />
      {children}
    </div>
  )
}

export { FxToastSpecimen }
