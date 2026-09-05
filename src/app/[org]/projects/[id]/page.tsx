import { ProjectDetailView } from '@/features/projects/components/project-detail-view'
import {
  getClientByProjectId,
  getCurrentUser,
  getMonthlyLoggedHours,
  getProjectAllocations,
  getProjectById,
  getProjectDeliverables,
  getProjectHoursSummary,
  getProjectMilestones,
  getProjectUpdates,
  getRecentProjectTimeEntries,
} from '@/features/projects/data'
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

  if (!project) {
    notFound()
  }

  const [
    updates,
    deliverables,
    milestones,
    allocations,
    loggedHours,
    client,
    user,
    hoursSummary,
    timeEntries,
  ] = await Promise.all([
    getProjectUpdates(id),
    getProjectDeliverables(id),
    getProjectMilestones(id),
    getProjectAllocations(id),
    getMonthlyLoggedHours(id),
    getClientByProjectId(id),
    getCurrentUser(),
    getProjectHoursSummary(id),
    getRecentProjectTimeEntries(id),
  ])

  return (
    <ProjectDetailView
      project={project}
      updates={updates}
      deliverables={deliverables}
      milestones={milestones}
      allocations={allocations}
      loggedHours={loggedHours}
      client={client}
      user={user}
      hoursSummary={hoursSummary}
      timeEntries={timeEntries}
    />
  )
}
