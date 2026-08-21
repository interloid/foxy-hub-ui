'use client'

import {
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import { ComponentProps } from 'react'

const fxMenuPanelVariants = cva(
  'bg-popover border-border shadow-panel rounded-xl border',
  {
    variants: {
      inset: {
        menu: 'p-1',
        form: 'p-3.5',
        none: 'overflow-hidden p-0',
      },
    },
    defaultVariants: { inset: 'menu' },
  }
)

function FxMenuPanel({
  className,
  inset,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof fxMenuPanelVariants>) {
  return (
    <div
      data-slot="fx-menu-panel"
      className={cn(fxMenuPanelVariants({ inset }), className)}
      {...props}
    />
  )
}

const fxMenuItemVariants = cva(
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-base font-medium',
  {
    variants: {
      tone: {
        default: 'text-foreground',
        destructive: 'text-destructive',
      },
      highlighted: {
        true: 'bg-accent',
        false: 'bg-transparent',
      },
    },
    defaultVariants: { tone: 'default', highlighted: false },
  }
)

function FxMenuItem({
  className,
  tone,
  highlighted,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof fxMenuItemVariants>) {
  return (
    <div
      data-slot="fx-menu-item"
      className={cn(fxMenuItemVariants({ tone, highlighted }), className)}
      {...props}
    />
  )
}

function FxMenuIcon({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="fx-menu-icon"
      aria-hidden
      className={cn(
        'size-3.5 shrink-0 rounded-[4px] bg-current opacity-50',
        className
      )}
      {...props}
    />
  )
}

function FxPopoverContent({
  className,
  ...props
}: ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      data-slot="fx-popover-content"
      align="start"
      sideOffset={8}
      className={cn(
        'border-border shadow-panel w-[270px] gap-3 rounded-xl border p-3.5 ring-0',
        className
      )}
      {...props}
    />
  )
}

const fxDropdownContentVariants = cva(
  'w-56 min-w-0 rounded-xl border border-border shadow-panel ring-0',
  {
    variants: {
      inset: {
        menu: 'p-1',
        none: 'overflow-hidden p-0',
      },
    },
    defaultVariants: { inset: 'menu' },
  }
)

function FxDropdownMenuContent({
  className,
  inset,
  align = 'end',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuContent> &
  VariantProps<typeof fxDropdownContentVariants>) {
  return (
    <DropdownMenuContent
      data-slot="fx-dropdown-menu-content"
      align={align}
      sideOffset={sideOffset}
      className={cn(fxDropdownContentVariants({ inset }), className)}
      {...props}
    />
  )
}

function FxDropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuItem>) {
  return (
    <DropdownMenuItem
      data-slot="fx-dropdown-menu-item"
      className={cn(
        'cursor-pointer gap-2.5 rounded-md px-2.5 py-2 text-base font-medium',
        'data-[variant=destructive]:focus:bg-destructive-subtle dark:data-[variant=destructive]:focus:bg-destructive-subtle',
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
export { Popover, PopoverTrigger } from '@/components/ui/popover'
export {
  fxDropdownContentVariants,
  FxDropdownMenuContent,
  FxDropdownMenuItem,
  FxMenuIcon,
  FxMenuItem,
  fxMenuItemVariants,
  FxMenuPanel,
  fxMenuPanelVariants,
  FxPopoverContent,
}
