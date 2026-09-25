import { LocaleProvider } from '@/context/locale-provider'
import { InactivityWatcher } from '@/components/common/inactivity-watcher'
import { ThemeSync } from '@/components/common/theme-sync'
import { TimeZoneSync } from '@/components/common/time-zone-sync'
import { AppShellWrapper } from '@/components/layout/app-shell-wrapper'
import { getFooter, withInvoiceCount, WORKSPACE } from '@/config/nav'
import { BreadcrumbProvider } from '@/context/breadcrump'
import { WorkspaceProvider } from '@/features/dashboard/context/workspace-context'
import { PROFILE } from '@/features/profile/data'
import {
  getAccount,
  getUnpaidInvoiceCount,
  getWorkspace,
  getUserTimeZone,
} from '@/lib/dal'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  const account = await getAccount(org)

  if (!account) redirect('/sign-in?error=session_expired')
  if (!account.isMember) {
    redirect(`/unauthorized?org=${encodeURIComponent(org)}`)
  }

  if (account.role === 'client') redirect(`/portal/${org}`)

  const [workspace, unpaidInvoices] = await Promise.all([
    getWorkspace(org),
    getUnpaidInvoiceCount(org),
  ])

  const sections = withInvoiceCount(unpaidInvoices, org, account.role)

  // The zone the SERVER resolved (manual → device cookie → IP → UTC), so the server
  // render and the browser render format timestamps identically (RISK-009).
  const timeZone = await getUserTimeZone()
  return (
    <LocaleProvider locale={account.locale} timeZone={timeZone}>
      <WorkspaceProvider
        orgSlug={org}
        orgId={workspace?.id}
        currency={workspace?.currency}
        userRole={account.role}
      >
        <BreadcrumbProvider>
          <AppShellWrapper
            sections={sections}
            workspace={{
              name: workspace?.name ?? account.orgName ?? WORKSPACE.name,
              org,
            }}
            account={{
              name:
                account.fullName ??
                account.email?.split('@')[0] ??
                PROFILE.noName,
              email: account.email ?? '',
              role: account.role ?? '',
              initials: account.initials,
              avatarUrl: account.avatarUrl,
              org,
            }}
            footer={getFooter(org, account.orgName)}
          >
            <InactivityWatcher timeout={account.inactivityTimeout} />
            <TimeZoneSync
              manualTimeZone={account.manualTimeZone}
              lastDeviceTimeZone={account.lastDeviceTimeZone}
            />
            <ThemeSync accountTheme={account.theme} />
            {children}
          </AppShellWrapper>
        </BreadcrumbProvider>
      </WorkspaceProvider>
    </LocaleProvider>
  )
}
