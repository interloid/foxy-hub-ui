import { TimeCard } from '@/features/time/components/time-cards'
import { TimeTrackingSection } from '@/features/time/components/time-tracking-section'
import { getTeamCapacityData } from '@/features/time/queries/get-capacity'
import {
  getPendingApprovals,
  getWeeklyTimeEntries,
  getWeeklyTimeSummary,
} from '@/features/time/queries/get-time-summary'
import { getAccount, getWorkspace } from '@/lib/dal'
import { notFound } from 'next/navigation'

interface TimePageProps {
  params: Promise<{
    org: string
  }>
}
export default async function TimePage({ params }: TimePageProps) {
  const { org } = await params
  const workspace = await getWorkspace(org)
  const acc = await getAccount(org)
  if (!workspace || !acc) {
    notFound()
  }

  const [timeEntriesSummary, timeEntries, approvals, capacityData] =
    await Promise.all([
      getWeeklyTimeSummary(workspace.id),
      getWeeklyTimeEntries(workspace.id),
      getPendingApprovals(workspace.id),
      getTeamCapacityData(workspace.id),
    ])
  const { standardHoursPerDay, capacities } = capacityData

  return (
    <div className="ds:p-6 space-y-6">
      <TimeTrackingSection userName={acc?.fullName ?? acc?.email ?? ''} />
      <TimeCard
        summary={timeEntriesSummary}
        entries={timeEntries}
        approvals={approvals}
        capacities={capacities}
        standardHoursPerDay={standardHoursPerDay}
        role={workspace.role}
      />
    </div>
  )
}
