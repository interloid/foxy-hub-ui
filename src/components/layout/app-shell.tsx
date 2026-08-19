'use client'

import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import { ComponentProps, ReactNode, useState } from 'react'
import { AppFooter } from './app-footer'
import { AppSidebar, type NavSection } from './app-sidebar'
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
  activeHref?: string
  workspace: { name: string; org: string }
  account: {
    name: string
    email: string
    role: string
    initials: string
    org?: string
  }
  breadcrumb?: ReactNode
  footer: ComponentProps<typeof AppFooter>
  notificationCount?: number
  onSearch?: () => void
  children: ReactNode
  className?: string
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  const currentActiveHref = activeHref ?? pathname

  const currentBreadcrumb = breadcrumb ?? getBreadcrumbFromPath(pathname)

  return (
    <div
      data-slot="app-shell"
      className={cn('flex h-dvh overflow-hidden', className)}
    >
      {/* Desktop Sidebar */}
      <AppSidebar
        className="shell:flex hidden"
        sections={sections}
        activeHref={currentActiveHref}
        workspace={workspace}
        account={account}
        onSearch={onSearch}
      />

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="shell:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setMobileOpen(false)}
          />

          <div className="bg-sidebar relative z-10 flex w-72 max-w-[80vw] flex-col shadow-xl">
            <AppSidebar
              isMobile
              sections={sections}
              activeHref={currentActiveHref}
              workspace={workspace}
              account={account}
              onSearch={() => {
                setMobileOpen(false)
                onSearch?.()
              }}
              onClose={() => setMobileOpen(false)}
              className="w-full flex-1 border-r-0"
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          breadcrumb={currentBreadcrumb}
          account={{ ...account, org: account.org ?? workspace.org }}
          notificationCount={notificationCount}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="shell:px-8 shell:pt-7 min-h-0 flex-1 overflow-y-auto px-4 pt-4.5 pb-16">
          <div className="max-w-content mx-auto flex min-h-full w-full flex-col">
            {children}
            <AppFooter {...footer} />
          </div>
        </main>
      </div>
    </div>
  )
}

function getBreadcrumbFromPath(pathname: string): ReactNode {
  if (pathname.endsWith('/profile/password')) return 'Change password'
  if (pathname.endsWith('/profile')) return 'Profile'
  return 'Home'
}
