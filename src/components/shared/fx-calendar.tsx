'use client'

import * as React from 'react'

import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

const fxCalendarVariants = {
  default:
    'rounded-xl border border-border bg-card text-card-foreground shadow-card',
  compact: 'rounded-lg border border-border bg-card text-card-foreground',
}

type FxCalendarProps = React.ComponentProps<typeof Calendar> & {
  variant?: keyof typeof fxCalendarVariants
}

function FxCalendar({
  className,
  variant = 'default',
  ...props
}: FxCalendarProps) {
  return (
    <Calendar
      data-slot="fx-calendar"
      className={cn(fxCalendarVariants[variant], className)}
      {...props}
    />
  )
}

export { FxCalendar, fxCalendarVariants }
