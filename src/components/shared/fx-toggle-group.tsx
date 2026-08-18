'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { ComponentProps } from 'react'

const fxToggleGroupVariants = cva(
  'bg-muted border-border w-fit border p-[2px]',
  {
    variants: {
      density: {
        segment: 'rounded-md',
        cycle: 'rounded-lg',

        'cycle-product': 'rounded-lg p-[3px]',
      },
    },
    defaultVariants: { density: 'segment' },
  }
)

const fxToggleGroupItemVariants = cva(
  'text-muted-foreground hover:text-foreground min-w-0 bg-transparent font-semibold transition-colors duration-(--duration-fast) hover:bg-transparent data-[state=on]:bg-primary data-[state=on]:text-white aria-pressed:bg-primary aria-pressed:text-white',
  {
    variants: {
      density: {
        segment: 'h-6.5 rounded-sm px-[11px] text-xs',
        cycle: 'h-7 rounded-[7px] px-[13px] text-sm capitalize',

        'cycle-product':
          'h-auto rounded-sm px-3.5 py-1.5 text-sm data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-card aria-pressed:bg-card aria-pressed:text-foreground',
      },
    },
    defaultVariants: { density: 'segment' },
  }
)

function FxToggleGroup({
  className,
  density,
  ...props
}: ComponentProps<typeof ToggleGroup> &
  VariantProps<typeof fxToggleGroupVariants>) {
  return (
    <ToggleGroup
      data-slot="fx-toggle-group"
      spacing={0.5}
      className={cn(fxToggleGroupVariants({ density }), className)}
      {...props}
    />
  )
}

function FxToggleGroupItem({
  className,
  density,
  ...props
}: ComponentProps<typeof ToggleGroupItem> &
  VariantProps<typeof fxToggleGroupItemVariants>) {
  return (
    <ToggleGroupItem
      data-slot="fx-toggle-group-item"
      className={cn(fxToggleGroupItemVariants({ density }), className)}
      {...props}
    />
  )
}

export {
  FxToggleGroup,
  FxToggleGroupItem,
  fxToggleGroupVariants,
  fxToggleGroupItemVariants,
}
