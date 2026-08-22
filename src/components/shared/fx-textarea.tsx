import * as React from 'react'

import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const fxTextareaVariants = {
  default:
    'border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0',
  subtle:
    'border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0',
}

type FxTextareaProps = React.ComponentProps<typeof Textarea> & {
  variant?: keyof typeof fxTextareaVariants
}

function FxTextarea({
  className,
  variant = 'default',
  ...props
}: FxTextareaProps) {
  return (
    <Textarea
      data-slot="fx-textarea"
      className={cn(
        fxTextareaVariants[variant],
        'resize-y', // Enables vertical drag resize handle
        className
      )}
      {...props}
    />
  )
}

export { FxTextarea, fxTextareaVariants }
