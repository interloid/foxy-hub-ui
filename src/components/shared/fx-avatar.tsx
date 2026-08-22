import { Avatar, AvatarFallback, AvatarGroup } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import * as React from 'react'

function FxAvatar({
  className,
  ...props
}: React.ComponentProps<typeof Avatar>) {
  return (
    <Avatar
      data-slot="fx-avatar"
      className={cn(
        'size-7.5 shadow-[0_0_0_2px_var(--card)] after:hidden',
        className
      )}
      {...props}
    />
  )
}

function FxAvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarFallback>) {
  return (
    <AvatarFallback
      data-slot="fx-avatar-fallback"
      className={cn('text-2xs font-semibold text-white', className)}
      {...props}
    />
  )
}

function FxAvatarGroup({
  className,
  ...props
}: React.ComponentProps<typeof AvatarGroup>) {
  return (
    <AvatarGroup
      data-slot="fx-avatar-group"
      className={cn('-space-x-2 *:data-[slot=avatar]:ring-0', className)}
      {...props}
    />
  )
}

export { FxAvatar, FxAvatarFallback, FxAvatarGroup }
