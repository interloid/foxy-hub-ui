'use client'

import * as React from 'react'

import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function FxDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogOverlay>) {
  return (
    <DialogOverlay
      data-slot="fx-dialog-overlay"
      className={cn('bg-black/55 p-6 backdrop-blur-[2px]', className)}
      {...props}
    />
  )
}

function FxDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      data-slot="fx-dialog-content"
      className={cn(
        'animate-fx-rise border-border shadow-panel w-[480px] max-w-[calc(100%-2rem)] gap-4 rounded-3xl border p-5 ring-0 sm:max-w-[480px]',
        className
      )}
      {...props}
    />
  )
}

function FxDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      data-slot="fx-dialog-header"
      className={cn('gap-1.5', className)}
      {...props}
    />
  )
}

/** 17px / 600 / −0.02em — `text-xl` carries the size and tracking; weight is a role. */
function FxDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  return (
    <DialogTitle
      data-slot="fx-dialog-title"
      className={cn('text-xl font-semibold', className)}
      {...props}
    />
  )
}

function FxDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  return (
    <DialogDescription
      data-slot="fx-dialog-description"
      className={cn('text-muted-foreground text-base', className)}
      {...props}
    />
  )
}

function FxDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      data-slot="fx-dialog-footer"
      className={cn(
        'mx-0 mb-0 flex-row justify-end gap-2 border-t-0 bg-transparent p-0',
        className
      )}
      {...props}
    />
  )
}

export {
  FxDialogOverlay,
  FxDialogContent,
  FxDialogHeader,
  FxDialogTitle,
  FxDialogDescription,
  FxDialogFooter,
}
