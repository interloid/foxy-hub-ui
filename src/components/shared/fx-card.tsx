import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
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

export { FxCard, FxCardContent }
