import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { ComponentProps } from 'react'

const fxBadgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1.5 border border-transparent leading-relaxed font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      size: {
        default: 'px-2.5 py-[3px] text-xs',
        sm: 'px-2 py-0.5 text-2xs',
        count: 'px-[7px] py-px font-mono text-2xs',
      },
      variant: {
        default: 'bg-primary-subtle text-primary-accent',
        secondary: 'bg-accent text-muted-foreground',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        destructive: 'bg-destructive-subtle text-destructive',
        info: 'bg-info-subtle text-info',
        solid: 'bg-primary text-primary-foreground',
        outline: 'border-border text-foreground',
      },
      shape: {
        pill: 'rounded-full',
        tag: 'rounded-sm',
      },
    },
    defaultVariants: { variant: 'secondary', shape: 'pill', size: 'default' },
  }
)

function FxBadge({
  className,
  variant,
  shape,
  size,
  dot = false,
  asChild = false,
  children,
  ...props
}: ComponentProps<'span'> &
  VariantProps<typeof fxBadgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="fx-badge"
      data-variant={variant ?? 'secondary'}
      className={cn(fxBadgeVariants({ variant, shape, size }), className)}
      {...props}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </Comp>
  )
}

export { FxBadge, fxBadgeVariants }
