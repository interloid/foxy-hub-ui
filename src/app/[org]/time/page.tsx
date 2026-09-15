import { TimeCard } from '@/features/time/components/time-cards'
import { TimeTrackingSection } from '@/features/time/components/time-tracking-section'
import { getTeamCapacityData } from '@/features/time/queries/get-capacity'
import {
  getPendingApprovals,
  getWeeklyTimeEntries,
  getWeeklyTimeSummary,
} from '@/features/time/queries/get-time-summary'
import { getWorkspace } from '@/lib/dal'
import { notFound } from 'next/navigation'

interface TimePageProps {
  params: Promise<{
    org: string
  }>
}
export default async function TimePage({ params }: TimePageProps) {
  const { org } = await params
  const workspace = await getWorkspace(org)
  if (!workspace) {
    notFound()
  }

  const [timeEntriesSummary, timeEntries, approvals, capacityData] =
    await Promise.all([
      getWeeklyTimeSummary(),
      getWeeklyTimeEntries(),
      getPendingApprovals(),
      getTeamCapacityData(workspace.id),
    ])
  const { standardHoursPerDay, capacities } = capacityData

  return (
    <>
      <TimeTrackingSection />
      <TimeCard
        summary={timeEntriesSummary}
        entries={timeEntries}
        approvals={approvals}
        capacities={capacities}
        standardHoursPerDay={standardHoursPerDay}
      />
    </>
  )
}
