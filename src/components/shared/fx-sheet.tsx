'use client'

import * as React from 'react'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

function FxSheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetContent>) {
  return (
    <SheetContent
      data-slot="fx-sheet-content"
      side="right"

      className={cn(
        'border-l-border-strong bg-popover shadow-panel gap-0 p-0',
        'data-[side=right]:w-full data-[side=right]:sm:max-w-125',
        className
      )}
      {...props}
    >
      {children}
    </SheetContent>
  )
}

function FxSheetHeader({
  className,
  ...props
}: React.ComponentProps<typeof SheetHeader>) {
  return (
    <SheetHeader
      data-slot="fx-sheet-header"
      className={cn(
        'border-border shrink-0 gap-1 border-b px-5 py-4',
        className
      )}
      {...props}
    />
  )
}

function FxSheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetTitle>) {
  return (
    <SheetTitle
      data-slot="fx-sheet-title"
      className={cn(
        'text-foreground text-[15px] leading-tight font-semibold',
        className
      )}
      {...props}
    />
  )
}

function FxSheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetDescription>) {
  return (
    <SheetDescription
      data-slot="fx-sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function FxSheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="fx-sheet-body"
      className={cn('min-h-0 flex-1 overflow-y-auto p-5', className)}
      {...props}
    />
  )
}

function FxSheetFooter({
  className,
  ...props
}: React.ComponentProps<typeof SheetFooter>) {
  return (
    <SheetFooter
      data-slot="fx-sheet-footer"
      className={cn(
        'border-border shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5',
        className
      )}
      {...props}
    />
  )
}

export {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
  SheetClose,
}
