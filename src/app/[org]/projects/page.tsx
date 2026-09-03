import { Skeleton } from '@/components/ui/skeleton'
import { ProjectsOverview } from '@/features/projects/components/project-overview'
import { getProjectsData } from '@/features/projects/data'
import { Suspense } from 'react'

interface ProjectsPageProps {
  params: Promise<{
    org: string
  }>
}

function ProjectsLoadingSkeleton() {
  return (
    <main className="ds:p-6 max-w-content mx-auto space-y-6 p-4">
      <header className="ds:flex-row ds:items-center ds:justify-between border-border flex flex-col gap-4 border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-28" />
        </div>
      </header>

      <section className="ds:grid-cols-2 grid grid-cols-1 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </section>

      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </main>
  )
}

async function ProjectsContent({ org }: { org: string }) {
  const { projects, metrics } = await getProjectsData(org)

  return (
    <ProjectsOverview
      initialProjects={projects}
      metrics={metrics}
      orgSlug={org}
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
