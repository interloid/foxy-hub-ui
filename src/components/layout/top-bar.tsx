'use client'

import { ThemeToggle } from '@/components/shared/theme-toggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'
import { Fragment } from 'react/jsx-runtime'
import { FxTooltipContent, FxTooltipTrigger } from '../shared/fx-tooltip'
import { Tooltip, TooltipProvider } from '../ui/tooltip'
import { AccountMenu } from './account-menu'
import { NAV_ICONS } from './nav-icons'

export interface BreadcrumbNavItem {
  label: string
  href?: string
}
export function TopBar({
  breadcrumbs = [],
  account,
  notificationCount = 0,
  onMenuClick,
  className,
}: {
  breadcrumbs: BreadcrumbNavItem[]
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
        className="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring shell:hidden flex size-8.5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <NAV_ICONS.menu size={18} strokeWidth={1.8} />
      </button>

      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1

            return (
              <Fragment key={item.label + index}>
                <BreadcrumbItem>
                  {isLast || !item.href ? (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={item.href}>
                      {item.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      <ThemeToggle />
      <TooltipProvider>
        <Tooltip>
          <FxTooltipTrigger asChild>
            <button
              type="button"
              aria-label={
                notificationCount > 0
                  ? `Notifications (${notificationCount} unread)`
                  : 'Notifications'
              }
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <NAV_ICONS.bell size={17} strokeWidth={1.6} />
              {notificationCount > 0 && (
                <span className="border-muted bg-primary absolute top-1.5 right-1.75 size-1.5 rounded-full border" />
              )}
            </button>
          </FxTooltipTrigger>
          <FxTooltipContent side="bottom">
            <p>Notifications</p>
          </FxTooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AccountMenu account={account} />
    </header>
  )
}
