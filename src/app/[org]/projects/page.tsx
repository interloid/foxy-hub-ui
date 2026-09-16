import { ProjectsOverview } from '@/features/projects/components/overview/projects-overview'
import { getProjectsData } from '@/features/projects/queries/get-projects'
import { ProjectsLoadingSkeleton } from '@/skeleton/projects-overview'
import type { Metadata } from 'next'
import { Suspense } from 'react'

interface ProjectsPageProps {
  params: Promise<{
    org: string
  }>
  searchParams: Promise<{
    page?: string
  }>
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

async function ProjectsContent({ org, page }: { org: string; page: number }) {
  const {
    projects,
    metrics,
    page: currentPage,
    pageSize,
    totalCount,
    totalPages,
  } = await getProjectsData({
    orgSlug: org,
    page,
    pageSize: 10,
  })

  return (
    <ProjectsOverview
      initialProjects={projects}
      metrics={metrics}
      orgSlug={org}
      page={currentPage}
      pageSize={pageSize}
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
  const page = resolvedSearchParams.page
    ? parseInt(resolvedSearchParams.page, 10)
    : 1

  return (
    <Suspense fallback={<ProjectsLoadingSkeleton />}>
      <ProjectsContent org={org} page={page} />
    </Suspense>
  )
}
