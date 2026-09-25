'use client'

import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export function FxConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
  destructive = true,
  isPending = false,
  nested = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  pendingLabel?: string
  onConfirm: () => void
  destructive?: boolean
  isPending?: boolean
  nested?: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={cn(nested && 'z-60')}>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                destructive
                  ? 'bg-destructive-subtle text-destructive'
                  : 'bg-info-subtle text-info'
              )}
            >
              <AlertTriangle className="size-4.5" />
            </span>
            <div className="min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15.5px]">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px]">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter className="bg-muted text-[13px]">
          <AlertDialogCancel
            size="lg"
            className="bg-card hover:bg-card cursor-pointer p-4"
            disabled={isPending}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            size="lg"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isPending}
            className="cursor-pointer p-4"
          >
            {isPending ? (pendingLabel ?? 'Working…') : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
