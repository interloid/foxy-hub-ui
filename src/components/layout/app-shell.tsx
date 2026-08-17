'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { AppFooter } from './app-footer'
import { AppSidebar, NavIcon, type NavSection } from './app-sidebar'
import { NavItem } from './nav-item'
import { TopBar } from './top-bar'

export function AppShell({
  sections,
  activeHref,
  workspace,
  account,
  breadcrumb,
  footer,
  notificationCount,
  onSearch,
  children,
  className,
}: {
  sections: NavSection[]
  activeHref: string
  workspace: { name: string; org: string }
  account: {
    name: string
    email: string
    role: string
    initials: string
    org?: string
  }
  breadcrumb: React.ReactNode
  footer: React.ComponentProps<typeof AppFooter>
  notificationCount?: number
  onSearch?: () => void
  children: React.ReactNode
  className?: string
}) {
  const primary = sections[0]?.items ?? []

  return (
    <div
      data-slot="app-shell"
      className={cn('flex h-dvh overflow-hidden', className)}
    >
      <AppSidebar
        className="shell:flex hidden"
        sections={sections}
        activeHref={activeHref}
        workspace={workspace}
        account={account}
        onSearch={onSearch}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          breadcrumb={breadcrumb}
          account={{ ...account, org: account.org ?? workspace.org }}
          notificationCount={notificationCount}
        />

        <main className="max-auth:px-4 max-auth:pt-4.5 max-auth:pb-19 min-h-0 flex-1 overflow-y-auto px-8 pt-7 pb-16">
          <div className="max-w-content mx-auto flex min-h-full w-full flex-col">
            {children}
            <AppFooter {...footer} />
          </div>
        </main>

        <nav className="border-border bg-sidebar shell:hidden flex shrink-0 items-center justify-around border-t px-1 py-1">
          {primary.map((item) => (
            <NavItem
              href={item.href}
              key={item.href}
              density="product"
              active={item.href === activeHref}
              icon={<NavIcon name={item.icon} />}
              role="link"
              aria-current={item.href === activeHref ? 'page' : undefined}
              className="text-2xs w-auto flex-col gap-0.5 px-2"
            >
              {item.label}
            </NavItem>
          ))}
        </nav>
      </div>
    </div>
  )
}
