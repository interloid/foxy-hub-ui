'use client'

import type { Project, ProjectMetrics } from '../../types'
import { ProjectTable } from './project-table'

interface ProjectsOverviewProps {
  initialProjects: Project[]
  metrics: ProjectMetrics
  orgSlug: string
  page?: number
  totalPages?: number
  totalCount?: number
  pageSize?: number
}

export function ProjectsOverview({
  initialProjects,
  orgSlug,
  page,
  totalCount,
  totalPages,
  pageSize,
}: ProjectsOverviewProps) {
  return (
    <main className="ds:p-6 w-full p-4">
      <ProjectTable
        initialProjects={initialProjects}
        orgSlug={orgSlug}
        initialPage={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
      />
    </main>
  )
}
