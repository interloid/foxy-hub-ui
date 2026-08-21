import { cva, type VariantProps } from 'class-variance-authority'
import { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const fxButtonVariants = cva(
  "active:!scale-100 active:!translate-y-0 !transition-none inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent whitespace-nowrap font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed duration-(--duration-fast) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-card hover:bg-primary-hover',
        secondary:
          'border-border bg-card text-foreground hover:border-border-strong hover:bg-muted',
        outline:
          'border-border-strong bg-transparent text-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:text-foreground',
        subtle: 'bg-primary-subtle text-primary-accent hover:brightness-110',
        destructive:
          'bg-destructive-subtle text-destructive hover:brightness-110',
        link: 'text-primary-accent underline-offset-4 hover:text-primary hover:underline',
        inset:
          'border-border bg-muted text-foreground hover:border-border-strong',
      },
      size: {
        xxs: 'h-6.5 rounded-sm px-[11px] text-xs',
        xs: 'h-7 px-[11px] text-[12px]',
        sm: 'h-7 px-[11px] text-base',
        default: 'h-9 px-[13px] text-base',
        lg: 'h-11 rounded-lg px-4 text-md',
        block: 'h-11 w-full rounded-lg px-4 text-md',
        icon: 'size-9',
        'icon-sm': 'size-8.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function FxButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<typeof Button> &
  VariantProps<typeof fxButtonVariants> & {
    asChild?: boolean
  }) {
  return (
    <Button
      asChild={asChild}
      data-slot="fx-button"
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      className={cn(fxButtonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { FxButton, fxButtonVariants }
