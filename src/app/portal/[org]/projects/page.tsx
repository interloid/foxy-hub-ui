import type { Metadata } from 'next'

import { PortalProjects } from '@/features/portal/components/portal-projects'
import {
  ALL_ENGAGEMENT_MODELS,
  ALL_PROJECT_STATUSES,
  DEFAULT_PAGE_SIZE,
} from '@/features/projects/constants'
import { getProjectsData } from '@/features/projects/queries/get-projects'
import type { EngagementModel, ProjectStatus } from '@/features/projects/types'
import { getAccount } from '@/lib/dal'

function asStatus(value?: string): ProjectStatus | undefined {
  return ALL_PROJECT_STATUSES.includes(value as ProjectStatus)
    ? (value as ProjectStatus)
    : undefined
}

function asEngagement(value?: string): EngagementModel | undefined {
  return ALL_ENGAGEMENT_MODELS.includes(value as EngagementModel)
    ? (value as EngagementModel)
    : undefined
}

interface PortalProjectsPageProps {
  params: Promise<{ org: string }>
  searchParams: Promise<{
    q?: string
    status?: string
    engagement?: string
    page?: string
    pageSize?: string
  }>
}

export async function generateMetadata({
  params,
}: PortalProjectsPageProps): Promise<Metadata> {
  const { org } = await params
  const account = await getAccount(org)

  return {
    title: `Projects | Foxy Hub`,
    description: `Projects shared with you by ${account?.orgName ?? org}`,
  }
}

export default async function PortalProjectsPage({
  params,
  searchParams,
}: PortalProjectsPageProps) {
  const { org } = await params
  const query = await searchParams

  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE)

  const projectsData = await getProjectsData({
    orgSlug: org,
    page,
    pageSize,
    search: query.q ?? '',
    status: asStatus(query.status),
    engagement: asEngagement(query.engagement),
  })

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PortalProjects
        projects={projectsData.projects}
        orgSlug={org}
        page={projectsData.page}
        totalPages={projectsData.totalPages}
        totalCount={projectsData.totalCount}
        pageSize={projectsData.pageSize}
      />
    </div>
  )
}
