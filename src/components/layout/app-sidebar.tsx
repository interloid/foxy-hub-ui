'use client'

import {
  readCollapsed,
  subscribeCollapsed,
  writeCollapsed,
} from '@/lib/sidebar'
import { cn } from '@/lib/utils'
import { Fragment, useSyncExternalStore } from 'react'
import { NAV_ICONS, type NavIconName } from './nav-icons'
import { NavItem } from './nav-item'

export type NavEntry = {
  label: string
  icon: NavIconName
  href: string
  count?: number
}

export type NavSection = {
  label?: string
  items: NavEntry[]
}

export function NavIcon({ name }: { name: NavIconName }) {
  const Icon = NAV_ICONS[name]
  return <Icon size={17} strokeWidth={1.7} className="shrink-0" />
}

export function AppSidebar({
  sections,
  activeHref,
  workspace,
  account,
  onSearch,
  className,
  isMobile = false,
  onClose,
}: {
  sections: NavSection[]
  activeHref: string
  workspace: { name: string; org: string }
  account: { name: string; role: string; initials: string }
  onSearch?: () => void
  className?: string
  isMobile?: boolean
  onClose?: () => void
}) {
  const collapsedState = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false
  )
  const collapsed = isMobile ? false : collapsedState
  const toggle = () => writeCollapsed(!collapsed)

  return (
    <aside
      data-slot="app-sidebar"
      data-collapsed={collapsed || undefined}
      className={cn(
        'border-border bg-sidebar flex shrink-0 flex-col border-r',
        'transition-[width] duration-200 ease-out',
        !isMobile && (collapsed ? 'w-17' : 'w-59'),
        className
      )}
    >
      {/* Brand row */}
      <div
        className={cn(
          'border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-3.5',
          collapsed && 'justify-center px-0'
        )}
      >
        <button
          type="button"
          onClick={isMobile ? onClose : toggle}
          aria-expanded={!collapsed}
          aria-label={workspace.name}
          className="bg-primary text-primary-foreground shadow-card hover:bg-primary-hover focus-visible:ring-ring flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[15px] font-bold transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {workspace.name.charAt(0)}
        </button>

        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-md truncate font-semibold">
                {workspace.name}
              </span>
              <span className="text-2xs text-subtle-foreground truncate">
                {workspace.org}
              </span>
            </span>
            {isMobile ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="border-border bg-muted text-muted-foreground hover:border-border-strong hover:text-foreground focus-visible:ring-ring flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                ✕
              </button>
            ) : (
              <button
                type="button"
                onClick={toggle}
                aria-label="Collapse sidebar"
                className="border-border bg-muted text-muted-foreground hover:border-border-strong hover:text-foreground focus-visible:ring-ring flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <NAV_ICONS.collapse size={16} strokeWidth={1.8} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
        <button
          type="button"
          onClick={onSearch}
          title={collapsed ? 'Search' : undefined}
          className={cn(
            'border-border bg-muted text-subtle-foreground hover:text-foreground focus-visible:ring-ring mb-1.5 flex h-8.25 w-full items-center gap-2 rounded-md border px-2.5 py-1.75 text-base transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            collapsed && 'justify-center px-0'
          )}
        >
          <NAV_ICONS.search size={15} strokeWidth={1.7} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <span className="bg-accent text-2xs rounded-[4px] px-1.25 py-px font-mono">
                ⌘K
              </span>
            </>
          )}
        </button>

        {sections.map((section, i) => (
          <Fragment key={section.label ?? `section-${i}`}>
            {section.label && (
              <>
                <div className="bg-border mx-1 my-1.5 h-px" />
                {!collapsed && (
                  <div className="text-2xs text-subtle-foreground px-2.5 pt-1 pb-1.5 leading-4 font-semibold">
                    {section.label}
                  </div>
                )}
              </>
            )}
            {section.items.map((item) => (
              <NavItem
                key={item.href}
                density="product"
                href={item.href}
                active={item.href === activeHref}
                icon={<NavIcon name={item.icon} />}
                count={item.count}
                collapsed={collapsed}
                title={item.label}
                role="link"
                onClick={() => {
                  if (isMobile) onClose?.()
                }}
                aria-current={item.href === activeHref ? 'page' : undefined}
              >
                {item.label}
              </NavItem>
            ))}
          </Fragment>
        ))}
      </div>

      {/* Account */}
      <div className="border-border shrink-0 border-t p-2.5">
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-md p-1.5',
            collapsed && 'justify-center p-0'
          )}
          title={collapsed ? `${account.name} · ${account.role}` : undefined}
        >
          <span className="bg-brand-gradient text-2xs text-primary-foreground flex size-7.5 shrink-0 items-center justify-center rounded-full font-semibold">
            {account.initials}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-base leading-3.75 font-medium">
                {account.name}
              </span>
              <span className="text-2xs text-subtle-foreground truncate leading-3.25">
                {account.role}
              </span>
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}
