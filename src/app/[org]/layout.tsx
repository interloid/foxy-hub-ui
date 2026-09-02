import { AppShell } from '@/components/layout/app-shell'
import { getFooter, withInvoiceCount, WORKSPACE } from '@/config/nav'
import { WorkspaceProvider } from '@/features/dashboard/context/workspace-context'
import { PROFILE } from '@/features/profile/data'
import { getAccount, getUnpaidInvoiceCount, getWorkspace } from '@/lib/dal'
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

  const [workspace, unpaidInvoices] = await Promise.all([
    getWorkspace(org),
    getUnpaidInvoiceCount(org),
  ])

  const sections = withInvoiceCount(unpaidInvoices, org)

  return (
    <WorkspaceProvider orgSlug={org} orgId={workspace?.id}>
      <AppShell
        sections={sections}
        workspace={{
          name: workspace?.name ?? account.orgName ?? WORKSPACE.name,
          org,
        }}
        account={{
          name:
            account.fullName ?? account.email?.split('@')[0] ?? PROFILE.noName,
          email: account.email ?? '',
          role: account.role ?? '',
          initials: account.initials,
          org,
        }}
        footer={getFooter(org, account.orgName)}
      >
        {children}
      </AppShell>
    </WorkspaceProvider>
  )
}
