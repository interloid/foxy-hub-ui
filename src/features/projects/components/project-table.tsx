import { FxBadge } from '@/components/shared/fx-badge'
import { FxCard } from '@/components/shared/fx-card'
import { FxProgress } from '@/components/shared/fx-progress'
import Link from 'next/link'
import type { Project, ProjectStatus } from '../types'

interface ProjectTableProps {
  projects: Project[]
  orgSlug: string
}

const statusBadgeMap: Record<
  ProjectStatus,
  {
    label: string
    variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary'
  }
> = {
  'in-progress': { label: 'In Progress', variant: 'info' },
  pending: { label: 'Pending', variant: 'secondary' },
  'pending-approval': { label: 'Pending Approval', variant: 'secondary' },

  'on-hold': { label: 'On Hold', variant: 'warning' },
  draft: { label: 'Draft', variant: 'info' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

const engagementLabelMap: Record<Project['engagement'], string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  fixed: 'Fixed Fee',
  retainer: 'Retainer',
}

export function ProjectTable({ projects = [], orgSlug }: ProjectTableProps) {
  return (
    <section aria-labelledby="all-projects-table-heading">
      <h2 id="all-projects-table-heading" className="sr-only">
        All Projects Table List
      </h2>

      <FxCard className="border-border shadow-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-secondary/30 text-2xs text-muted-foreground border-border border-b font-semibold tracking-wider uppercase">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Project
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Engagement
                </th>
                <th scope="col" className="w-48 px-4 py-3 font-semibold">
                  Progress
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Team
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Value
                </th>
              </tr>
            </thead>

            <tbody className="divide-border divide-y text-xs">
              {projects.map((project) => {
                const statusConfig = statusBadgeMap[project.status] ?? {
                  label: project.status,
                  variant: 'secondary',
                }

                const numericValue =
                  project.contractValue ?? project.retainerAmount ?? 0

                const formattedValue = new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                }).format(numericValue)

                return (
                  <tr
                    key={project.id}
                    className="hover:bg-muted/40 duration-fast group transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <article className="flex flex-col">
                        <span className="text-subtle-foreground font-mono text-[10px] tracking-wider uppercase">
                          {project.code}
                        </span>
                        <h3 className="group-hover:text-primary text-foreground duration-fast text-sm leading-snug font-semibold transition-colors">
                          <Link
                            href={`/${orgSlug}/projects/${project.id}`}
                            className="focus:ring-ring rounded-sm focus:ring-1 focus:outline-none"
                          >
                            {project.name}
                          </Link>
                        </h3>
                        <p className="text-2xs text-muted-foreground mt-0.5">
                          {project.clientName}
                        </p>
                      </article>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <FxBadge
                        variant={statusConfig.variant}
                        className="capitalize"
                      >
                        {statusConfig.label}
                      </FxBadge>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <span className="text-2xs text-muted-foreground font-medium">
                        {engagementLabelMap[project.engagement] ??
                          project.engagement}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center gap-3">
                        <FxProgress
                          value={project.progressPercent}
                          className="h-2 flex-1"
                        />
                        <span className="text-2xs text-muted-foreground w-8 text-right font-mono font-medium">
                          {project.progressPercent}%
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <address className="flex items-center -space-x-1.5 overflow-hidden not-italic">
                        {project.members && project.members.length > 0 ? (
                          <>
                            {project.members.slice(0, 3).map((member) => (
                              <div
                                key={member.id}
                                title={member.name}
                                className="border-card bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full border-2 font-mono text-[9px] font-semibold uppercase select-none"
                              >
                                {member.name.substring(0, 2).toUpperCase()}
                              </div>
                            ))}
                            {project.members.length > 3 && (
                              <span className="border-card bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-medium">
                                +{project.members.length - 3}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-2xs text-subtle-foreground italic">
                            Unassigned
                          </span>
                        )}
                      </address>
                    </td>

                    <td className="text-foreground px-4 py-3.5 text-right align-middle font-mono font-bold">
                      {numericValue > 0 ? formattedValue : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </FxCard>
    </section>
  )
}
