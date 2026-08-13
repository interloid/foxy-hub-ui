import * as React from 'react'

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function FxCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      data-slot="fx-card"
      className={cn(
        'border-border shadow-card gap-0 border py-0 ring-0',
        className
      )}
      {...props}
    />
  )
}

/** Bordered strip: 13px 16px + `border-bottom`. Title is 14px/600 at the call site. */
function FxCardHeader({
  className,
  ...props
}: React.ComponentProps<typeof CardHeader>) {
  return (
    <CardHeader
      data-slot="fx-card-header"
      className={cn('border-b py-[13px] [.border-b]:pb-[13px]', className)}
      {...props}
    />
  )
}

/** Body: 16px all round. The generated one is horizontal-only. */
function FxCardContent({
  className,
  ...props
}: React.ComponentProps<typeof CardContent>) {
  return (
    <CardContent
      data-slot="fx-card-content"
      className={cn('p-4', className)}
      {...props}
    />
  )
}

/** Footer already matches: `p-(--card-spacing)` + `border-t`. */
function FxCardFooter({
  className,
  ...props
}: React.ComponentProps<typeof CardFooter>) {
  return (
    <CardFooter
      data-slot="fx-card-footer"
      className={cn(className)}
      {...props}
    />
  )
}

export { FxCard, FxCardHeader, FxCardContent, FxCardFooter }
