'use client'

import { ThemeToggle } from '@/components/shared/theme-toggle'
import { cn } from '@/lib/utils'
import * as React from 'react'
import { AccountMenu } from './account-menu'
import { NAV_ICONS } from './nav-icons'

export function TopBar({
  breadcrumb,
  account,
  notificationCount = 0,
  className,
}: {
  breadcrumb: React.ReactNode
  account: { name: string; email: string; initials: string; org?: string }
  notificationCount?: number
  className?: string
}) {
  return (
    <header
      data-slot="top-bar"
      className={cn(
        'border-border bg-header sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b px-5 backdrop-blur-sm',
        className
      )}
    >
      <div className="text-muted-foreground dash:flex hidden min-w-0 items-center gap-1.75 text-base">
        {breadcrumb}
      </div>

      <div className="flex-1" />

      <ThemeToggle />
      <button
        type="button"
        aria-label={
          notificationCount > 0
            ? `Notifications (${notificationCount} unread)`
            : 'Notifications'
        }
        className="border-border bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring relative flex size-8.5 shrink-0 items-center justify-center rounded-md border transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <NAV_ICONS.bell size={17} strokeWidth={1.6} />
        {notificationCount > 0 ? (
          <span className="border-muted bg-primary absolute top-1.5 right-1.75 size-1.5 rounded-full border" />
        ) : null}
      </button>

      <AccountMenu account={account} />
    </header>
  )
}
