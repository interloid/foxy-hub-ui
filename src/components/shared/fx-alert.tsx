import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Alert } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

const fxAlertVariants = cva(
  'grid items-start gap-2.5 rounded-md border px-3.5 py-3 text-base leading-snug has-[>svg]:grid-cols-[auto_1fr] *:[svg]:mt-px *:[svg]:size-4',
  {
    variants: {
      tone: {
        default: 'border-border bg-card text-muted-foreground',
        brand: 'bg-primary-subtle text-primary-accent border-transparent',
        info: 'bg-info-subtle text-info border-transparent',
        warning: 'bg-warning-subtle text-warning border-transparent',
        destructive:
          'bg-destructive-subtle text-destructive border-transparent',
        success: 'bg-success-subtle text-success border-transparent',
      },
    },
    defaultVariants: { tone: 'default' },
  }
)

function FxAlert({
  className,
  tone,
  ...props
}: React.ComponentProps<typeof Alert> & VariantProps<typeof fxAlertVariants>) {
  return (
    <Alert
      data-slot="fx-alert"
      data-tone={tone ?? 'default'}
      className={cn(fxAlertVariants({ tone }), className)}
      {...props}
    />
  )
}

export { FxAlert, fxAlertVariants }
