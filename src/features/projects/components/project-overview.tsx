'use client'

import type { Project, ProjectMetrics } from '../types'
import { ProjectTable } from './project-table'

interface ProjectsOverviewProps {
  initialProjects: Project[]
  metrics: ProjectMetrics
  orgSlug: string
}

export function ProjectsOverview({
  initialProjects,
  orgSlug,
}: ProjectsOverviewProps) {
  return (
    <main className="ds:p-6 max-w-content mx-auto p-4">
      <ProjectTable projects={initialProjects} orgSlug={orgSlug} />
    </main>
  )
}
