import type { Metadata } from 'next'

import { StatsGrid } from '@/features/dashboard/components/overview/stats-grid'
import { TimeGreeting } from '@/features/dashboard/components/overview/time-greetings'
import { ActiveProjects } from '@/features/dashboard/components/widgets/active-projects'
import { PendingApprovals } from '@/features/dashboard/components/widgets/pending-approvals'
import { RecentActivity } from '@/features/dashboard/components/widgets/recent-activity'
import type { DashboardStat } from '@/features/dashboard/types'
import { getPortalDashboard, getPortalMetrics } from '@/features/portal/queries'
import { getAccount, getFormatter, getWorkspace } from '@/lib/dal'

interface PortalHomeProps {
  params: Promise<{ org: string }>
}

export async function generateMetadata({
  params,
}: PortalHomeProps): Promise<Metadata> {
  const { org } = await params
  const account = await getAccount(org)
  const orgName = account?.orgName ?? 'Workspace'

  return {
    title: `Dashboard - ${orgName} | Foxy Hub`,
    description: `Projects and invoices shared with you by ${orgName}`,
  }
}

export default async function PortalHomePage({ params }: PortalHomeProps) {
  const fmt = await getFormatter()
  const { org } = await params

  const [account, workspace] = await Promise.all([
    getAccount(org),
    getWorkspace(org),
  ])

  const [metrics, widgets] = workspace
    ? await Promise.all([
        getPortalMetrics(workspace.id, workspace.currency),
        getPortalDashboard(workspace.id, workspace.currency),
      ])
    : [null, null]

  const stats: DashboardStat[] = metrics
    ? [
        {
          label: 'Active projects',
          value: String(metrics.activeProjects),
          delta:
            metrics.projectsAddedThisMonth > 0
              ? `+${metrics.projectsAddedThisMonth} this month`
              : 'No new work this month',
          deltaType: 'success',
          iconType: 'info',
          icon: 'projects',
        },
        {
          label: 'Awaiting your approval',
          value: String(metrics.pendingApprovals),
          delta:
            metrics.approvalsDueThisWeek > 0
              ? `${metrics.approvalsDueThisWeek} due this week`
              : 'Nothing due this week',
          deltaType: 'warning',
          iconType: 'warning',
          icon: 'approvals',
        },
        {
          label: 'Outstanding',
          value: fmt.currency(metrics.outstandingAmount, metrics.currency),
          delta:
            metrics.overdueInvoices > 0
              ? `${metrics.overdueInvoices} overdue`
              : `${metrics.unpaidInvoices} unpaid`,
          deltaType: metrics.overdueInvoices > 0 ? 'destructive' : 'info',
          iconType: metrics.overdueInvoices > 0 ? 'destructive' : 'info',
          icon: 'invoices',
        },
      ]
    : []

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <TimeGreeting
        userName={account?.fullName ?? null}
        subtitle={`Here is where things stand with ${account?.orgName ?? org}.`}
      />

      <StatsGrid stats={stats} role={account?.role} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-20">
        <div className="space-y-6 lg:col-span-11">
          <PendingApprovals approvals={widgets?.approvals ?? []} />
          <ActiveProjects projects={widgets?.projects ?? []} />
        </div>

        <div className="space-y-6 lg:col-span-9">
          <RecentActivity activities={widgets?.activities ?? []} />
        </div>
      </div>
    </div>
  )
}
