import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { ComponentProps } from 'react'

function FxEmpty({ className, ...props }: ComponentProps<typeof Empty>) {
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
}: ComponentProps<typeof EmptyHeader>) {
  return (
    <EmptyHeader
      data-slot="fx-empty-header"
      className={cn('max-w-none gap-2.25', className)}
      {...props}
    />
  )
}

function FxEmptyMedia({
  className,
  ...props
}: ComponentProps<typeof EmptyMedia>) {
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
}: ComponentProps<typeof EmptyTitle>) {
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
}: ComponentProps<typeof EmptyDescription>) {
  return (
    <EmptyDescription
      data-slot="fx-empty-description"
      className={cn('text-muted-foreground max-w-75 text-base', className)}
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
}
