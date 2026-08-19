// TopBar.tsx
'use client'

import { ThemeToggle } from '@/components/shared/theme-toggle'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'
import { AccountMenu } from './account-menu'
import { NAV_ICONS } from './nav-icons'

export function TopBar({
  breadcrumb,
  account,
  notificationCount = 0,
  onMenuClick,
  className,
}: {
  breadcrumb: ReactNode
  account: { name: string; email: string; initials: string; org?: string }
  notificationCount?: number
  onMenuClick?: () => void
  className?: string
}) {
  return (
    <header
      data-slot="top-bar"
      className={cn(
        'border-border bg-header shell:px-5 sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm',
        className
      )}
    >
      {/* Hamburger Icon on Mobile */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open sidebar"
        className="border-border bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring shell:hidden flex size-8.5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <NAV_ICONS.menu size={18} strokeWidth={1.8} />
      </button>

      <div className="text-muted-foreground flex min-w-0 items-center gap-1.75 text-base">
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
        {notificationCount > 0 && (
          <span className="border-muted bg-primary absolute top-1.5 right-1.75 size-1.5 rounded-full border" />
        )}
      </button>

      <AccountMenu account={account} />
    </header>
  )
}
