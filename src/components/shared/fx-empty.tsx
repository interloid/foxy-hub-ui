import * as React from 'react'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

function FxEmpty({ className, ...props }: React.ComponentProps<typeof Empty>) {
  return (
    <Empty
      data-slot="fx-empty"
      className={cn('flex-none gap-2.25 rounded-none border-0 p-0', className)}
      {...props}
    />
  )
}

function FxEmptyHeader({
  className,
  ...props
}: React.ComponentProps<typeof EmptyHeader>) {
  return (
    <EmptyHeader
      data-slot="fx-empty-header"
      className={cn('max-w-none gap-2.25', className)}
      {...props}
    />
  )
}

/** 40px tile. Gap on the stack replaces the stock `mb-2`, so it is cancelled here. */
function FxEmptyMedia({
  className,
  ...props
}: React.ComponentProps<typeof EmptyMedia>) {
  return (
    <EmptyMedia
      data-slot="fx-empty-media"
      variant="icon"
      className={cn(
        'border-border bg-muted text-subtle-foreground mb-0 size-10 rounded-md border',
        className
      )}
      {...props}
    />
  )
}

function FxEmptyTitle({
  className,
  ...props
}: React.ComponentProps<typeof EmptyTitle>) {
  return (
    <EmptyTitle
      data-slot="fx-empty-title"
      className={cn('text-md font-semibold tracking-normal', className)}
      {...props}
    />
  )
}

function FxEmptyDescription({
  className,
  ...props
}: React.ComponentProps<typeof EmptyDescription>) {
  return (
    <EmptyDescription
      data-slot="fx-empty-description"
      className={cn('text-muted-foreground max-w-[300px] text-base', className)}
      {...props}
    />
  )
}

function FxEmptyContent({
  className,
  ...props
}: React.ComponentProps<typeof EmptyContent>) {
  return (
    <EmptyContent
      data-slot="fx-empty-content"
      className={cn('mt-1 max-w-none', className)}
      {...props}
    />
  )
}

export {
  FxEmpty,
  FxEmptyHeader,
  FxEmptyMedia,
  FxEmptyTitle,
  FxEmptyDescription,
  FxEmptyContent,
}
