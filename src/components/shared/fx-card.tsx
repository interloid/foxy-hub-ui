import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ComponentProps } from 'react'

function FxCard({ className, ...props }: ComponentProps<typeof Card>) {
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
}: ComponentProps<typeof CardContent>) {
  return (
    <CardContent
      data-slot="fx-card-content"
      className={cn('p-4', className)}
      {...props}
    />
  )
}

export { FxCard, FxCardContent }
