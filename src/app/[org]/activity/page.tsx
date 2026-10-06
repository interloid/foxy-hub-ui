import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { WorkspaceActivityView } from '@/features/activity/components/workspace-activity-view'
import { getWorkspaceActivity } from '@/features/activity/queries/get-workspace-activity'
import { getWorkspace } from '@/lib/dal'
import { isBillingRole } from '@/lib/role'

export const metadata: Metadata = {
  title: 'Activity | Foxy Hub',
}

interface ActivityPageProps {
  params: Promise<{ org: string }>
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { org } = await params

  // Primary admin and admin only - the sidebar hides the link from everyone else, and this
  // keeps a typed-in URL from reaching it.
  const workspace = await getWorkspace(org)
  if (!workspace || !isBillingRole(workspace.role)) notFound()

  const activities = await getWorkspaceActivity(workspace.id)

  return (
    <div className="ds:p-6">
      <WorkspaceActivityView activities={activities} />
    </div>
  )
}
