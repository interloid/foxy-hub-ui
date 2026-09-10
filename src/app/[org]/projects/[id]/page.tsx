import { ProjectDetailView } from '@/features/projects/components/common/project-detail-view'
import {
  getClientByProjectId,
  getCurrentUser,
  getProjectAllocations,
  getProjectHoursSummary,
  getRecentProjectTimeEntries,
} from '@/features/projects/data'
import {
  getProjectDeliverables,
  getProjectDeliveries,
} from '@/features/projects/queries/get-deliverables'
import { getProjectsForInvoicing } from '@/features/projects/queries/get-invoice'
import { getProjectMilestones } from '@/features/projects/queries/get-milestone'
import { getProjectById } from '@/features/projects/queries/get-projects'
import { getMonthlyLoggedHours } from '@/features/projects/queries/get-time-entries'
import { getProjectUpdates } from '@/features/projects/queries/get-updates'
import { HoursSummaryData } from '@/features/projects/types'
import { getWorkspace, isAdminRole } from '@/lib/dal'
import { notFound } from 'next/navigation'

interface ProjectDetailPageProps {
  params: Promise<{
    org: string
    id: string
  }>
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { org, id } = await params

  const project = await getProjectById(org, id)
  const DEFAULT_HOURS_SUMMARY: HoursSummaryData = {
    loggedMinutes: 0,
    approvedMinutes: 0,
    pendingMinutes: 0,
  }
  if (!project) {
    notFound()
  }

  const workspace = await getWorkspace(org)
  const canManageAllocations = workspace ? isAdminRole(workspace.role) : false

  const results = await Promise.allSettled([
    getProjectsForInvoicing(org),
    getProjectUpdates(id),
    getProjectDeliverables(id),
    getProjectMilestones(id),
    getProjectAllocations(id),
    getMonthlyLoggedHours(id),
    getClientByProjectId(id),
    getCurrentUser(),
    getProjectHoursSummary(id),
    getRecentProjectTimeEntries(id),
    getProjectDeliveries(id),
  ])

  // Extract result values or fallback to empty state defaults
  const invoiceProjects =
    results[0].status === 'fulfilled' ? results[0].value : []
  const updates = results[1].status === 'fulfilled' ? results[1].value : []
  const deliverables = results[2].status === 'fulfilled' ? results[2].value : []
  const milestones = results[3].status === 'fulfilled' ? results[3].value : []
  const allocations = results[4].status === 'fulfilled' ? results[4].value : []
  const loggedHours =
    results[5].status === 'fulfilled' && typeof results[5].value === 'number'
      ? results[5].value
      : 0
  const client = results[6].status === 'fulfilled' ? results[6].value : null
  const user = results[7].status === 'fulfilled' ? results[7].value : null
  const hoursSummary =
    (results[8].status === 'fulfilled' ? results[8].value : null) ??
    DEFAULT_HOURS_SUMMARY
  const timeEntries = results[9].status === 'fulfilled' ? results[9].value : []
  const deliveries = results[10].status === 'fulfilled' ? results[10].value : []

  return (
    <ProjectDetailView
      project={project}
      invoiceProjects={invoiceProjects}
      updates={updates}
      deliverables={deliverables}
      milestones={milestones}
      allocations={allocations}
      loggedHours={loggedHours}
      client={client}
      user={user}
      hoursSummary={hoursSummary}
      timeEntries={timeEntries}
      canManageAllocations={canManageAllocations}
      deliveries={deliveries}
    />
  )
}
