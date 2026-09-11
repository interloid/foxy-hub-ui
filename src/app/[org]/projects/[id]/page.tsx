import { ProjectDetailView } from '@/features/projects/components/common/project-detail-view'

import {
  getProjectDeliverables,
  getProjectDeliveries,
} from '@/features/projects/queries/get-deliverables'
import { getProjectsForInvoicing } from '@/features/projects/queries/get-invoice'
import { getProjectMilestones } from '@/features/projects/queries/get-milestone'
import {
  getClientByProjectId,
  getProjectAllocations,
  getProjectById,
} from '@/features/projects/queries/get-projects'
import {
  getCurrentUser,
  getMonthlyLoggedHours,
  getProjectHoursSummary,
  getRecentProjectTimeEntries,
} from '@/features/projects/queries/get-time-entries'
import { getProjectUpdates } from '@/features/projects/queries/get-updates'
import { HoursSummaryData } from '@/features/projects/types'
import { getWorkspace, isAdminRole } from '@/lib/dal'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

interface ProjectDetailPageProps {
  params: Promise<{
    org: string
    id: string
  }>
}

export async function generateMetadata({
  params,
}: ProjectDetailPageProps): Promise<Metadata> {
  const { org, id } = await params
  const project = await getProjectById(org, id)

  if (!project) {
    return {
      title: 'Project Not Found | Foxy Hub',
    }
  }

  return {
    title: `${project.name} | Foxy Hub`,
    description: project.description ?? `Project overview for ${project.name}`,
  }
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

  // 1. Execute queries concurrently
  const [
    invoiceProjectsResult,
    updatesResult,
    deliverablesResult,
    milestonesResult,
    allocationsResult,
    loggedHoursResult,
    clientResult,
    userResult,
    hoursSummaryResult,
    timeEntriesResult,
    deliveriesResult,
  ] = await Promise.allSettled([
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

  // Helper to handle results, log errors to Sentry, and return state
  function processResult<T>(
    result: PromiseSettledResult<T>,
    queryName: string,
    fallback: T
  ): { data: T; isError: boolean } {
    if (result.status === 'fulfilled') {
      return { data: result.value ?? fallback, isError: false }
    }

    const error =
      result.reason instanceof Error
        ? result.reason
        : new Error(`Query failed: ${queryName}`)

    console.error(`[ProjectPage Query Error] ${queryName}:`, error)

    return { data: fallback, isError: true }
  }

  // 2. Safely process each query result
  const invoiceProjects = processResult(
    invoiceProjectsResult,
    'getProjectsForInvoicing',
    []
  )
  const updates = processResult(updatesResult, 'getProjectUpdates', [])
  const deliverables = processResult(
    deliverablesResult,
    'getProjectDeliverables',
    []
  )
  const milestones = processResult(milestonesResult, 'getProjectMilestones', [])
  const allocations = processResult(
    allocationsResult,
    'getProjectAllocations',
    []
  )
  const loggedHours = processResult(
    loggedHoursResult,
    'getMonthlyLoggedHours',
    0
  )
  const client = processResult(clientResult, 'getClientByProjectId', null)
  const user = processResult(userResult, 'getCurrentUser', null)
  const hoursSummary = processResult(
    hoursSummaryResult,
    'getProjectHoursSummary',
    DEFAULT_HOURS_SUMMARY
  )
  const timeEntries = processResult(
    timeEntriesResult,
    'getRecentProjectTimeEntries',
    []
  )
  const deliveries = processResult(deliveriesResult, 'getProjectDeliveries', [])

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
