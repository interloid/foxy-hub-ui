import {
  getClientsForOrg,
  getTeamMembersForOrg,
} from '@/features/dashboard/queries'
import { ProjectsOverview } from '@/features/projects/components/overview/projects-overview'
import { getProjectsData } from '@/features/projects/queries/get-projects'
import type { EngagementModel, ProjectStatus } from '@/features/projects/types'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type ProjectsTab,
} from '@/features/projects/constants'
import { ProjectsLoadingSkeleton } from '@/skeleton/projects-overview'
import type { Metadata } from 'next'
import { Suspense } from 'react'

interface ProjectsPageSearchParams {
  page?: string
  pageSize?: string
  q?: string
  tab?: string
  status?: string
  client?: string
  team?: string
  engagement?: string
}

interface ProjectsPageProps {
  params: Promise<{
    org: string
  }>
  searchParams: Promise<ProjectsPageSearchParams>
}

export async function generateMetadata({
  params,
}: ProjectsPageProps): Promise<Metadata> {
  const { org } = await params

  return {
    title: `Projects | Foxy Hub`,
    description: `Manage and track projects for ${org}`,
  }
}

async function ProjectsContent({
  org,
  page,
  pageSize,
  searchParams,
}: {
  org: string
  page: number
  pageSize: number
  searchParams: ProjectsPageSearchParams
}) {
  const [
    {
      projects,
      metrics,
      tabCounts,
      page: currentPage,
      pageSize: currentPageSize,
      totalCount,
      totalPages,
    },
    clients,
    teamMembers,
  ] = await Promise.all([
    getProjectsData({
      orgSlug: org,
      page,
      pageSize,
      search: searchParams.q,
      tab: searchParams.tab as ProjectsTab | undefined,
      status: searchParams.status as ProjectStatus | undefined,
      engagement: searchParams.engagement as EngagementModel | undefined,
      clientId: searchParams.client,
      teamMemberId: searchParams.team,
    }),
    getClientsForOrg(org),
    getTeamMembersForOrg(org),
  ])

  return (
    <ProjectsOverview
      initialProjects={projects}
      metrics={metrics}
      tabCounts={tabCounts}
      clients={clients}
      teamMembers={teamMembers}
      orgSlug={org}
      page={currentPage}
      pageSize={currentPageSize}
      totalCount={totalCount}
      totalPages={totalPages}
    />
  )
}

export default async function ProjectsPage({
  params,
  searchParams,
}: ProjectsPageProps) {
  const { org } = await params
  const resolvedSearchParams = await searchParams
  const parsedPage = resolvedSearchParams.page
    ? parseInt(resolvedSearchParams.page, 10)
    : 1
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const parsedPageSize = resolvedSearchParams.pageSize
    ? parseInt(resolvedSearchParams.pageSize, 10)
    : DEFAULT_PAGE_SIZE
  const pageSize = PAGE_SIZE_OPTIONS.includes(
    parsedPageSize as (typeof PAGE_SIZE_OPTIONS)[number]
  )
    ? parsedPageSize
    : DEFAULT_PAGE_SIZE

  return (
    <Suspense fallback={<ProjectsLoadingSkeleton />}>
      <ProjectsContent
        org={org}
        page={page}
        pageSize={pageSize}
        searchParams={resolvedSearchParams}
      />
    </Suspense>
  )
}
