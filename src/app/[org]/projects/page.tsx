import { ProjectsOverview } from '@/features/projects/components/overview/projects-overview'
import { getProjectsData } from '@/features/projects/queries/get-projects'
import { ProjectsLoadingSkeleton } from '@/skeleton/projects-overview'
import type { Metadata } from 'next'
import { Suspense } from 'react'

interface ProjectsPageProps {
  params: Promise<{
    org: string
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

async function ProjectsContent({ org }: { org: string }) {
  const { projects, metrics, page, pageSize, totalCount, totalPages } =
    await getProjectsData({
      orgSlug: org,
      page: 1,
      pageSize: 5,
    })

  return (
    <ProjectsOverview
      initialProjects={projects}
      metrics={metrics}
      orgSlug={org}
      page={page}
      pageSize={pageSize}
      totalCount={totalCount}
      totalPages={totalPages}
    />
  )
}

export default async function ProjectsPage({ params }: ProjectsPageProps) {
  const { org } = await params

  return (
    <Suspense fallback={<ProjectsLoadingSkeleton />}>
      <ProjectsContent org={org} />
    </Suspense>
  )
}
