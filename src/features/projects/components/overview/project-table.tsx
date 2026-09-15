'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxCard } from '@/components/shared/fx-card'
import { FxProgress } from '@/components/shared/fx-progress'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { TableBody } from '@/components/ui/table'
import { ProjectsLoadingSkeleton } from '@/skeleton/projects-overview'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Project, ProjectStatus } from '../../types'

interface ProjectTableProps {
  initialProjects?: Project[]
  orgSlug?: string
  initialPage?: number
  totalPages?: number
  totalCount?: number
  pageSize?: number
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

export function ProjectTable({
  initialProjects = [],
  orgSlug = '',
  initialPage = 1,
  totalPages = 1,
  totalCount = 0,
  pageSize = 10,
}: ProjectTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const urlPageParam = searchParams.get('page')
  const page = urlPageParam ? parseInt(urlPageParam, 10) : initialPage

  const updatePageUrl = (newPage: number) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', newPage.toString())
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const handleNextPage = () => {
    if (page < totalPages && !isPending) {
      updatePageUrl(page + 1)
    }
  }

  const handlePrevPage = () => {
    if (page > 1 && !isPending) {
      updatePageUrl(page - 1)
    }
  }

  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="ds:items-between ds:justify-between flex flex-col gap-4 md:flex-row md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-foreground ds:text-2xl min-w-0 text-[22px]! font-medium tracking-tight">
              All Projects
            </h1>
          </div>
        </div>
      </header>

      <section aria-labelledby="all-projects-table-heading">
        <FxCard className="border-border shadow-card overflow-hidden p-0">
          <div className="min-h-162.5 w-full overflow-x-auto">
            <FxTable className="w-full min-w-197.5 table-fixed">
              <FxTableHeader>
                <FxTableRow className="bg-secondary/30 hover:bg-secondary/30 justify-center">
                  <FxTableHead className="w-57.5 text-center">
                    Project
                  </FxTableHead>
                  <FxTableHead className="w-35 text-center">Client</FxTableHead>
                  <FxTableHead className="w-35 text-center">Status</FxTableHead>
                  <FxTableHead className="w-35 text-center">
                    Engagement
                  </FxTableHead>
                  <FxTableHead className="w-35 text-center">
                    Progress
                  </FxTableHead>
                  <FxTableHead className="w-35 text-center">Value</FxTableHead>
                </FxTableRow>
              </FxTableHeader>

              <TableBody className="divide-border divide-y text-xs">
                {isPending ? (
                  <ProjectsLoadingSkeleton variant="rows" count={pageSize} />
                ) : initialProjects.length === 0 ? (
                  <FxTableRow>
                    <FxTableCell
                      colSpan={6}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No projects found.
                    </FxTableCell>
                  </FxTableRow>
                ) : (
                  initialProjects.map((project) => {
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
                      <FxTableRow
                        key={project.id}
                        className="hover:bg-muted/40 duration-fast group h-16.25 transition-colors"
                      >
                        <FxTableCell className="text-center align-middle">
                          <article className="mx-auto flex w-fit flex-col items-start overflow-hidden">
                            <h3 className="group-hover:text-primary text-foreground duration-fast truncate text-left text-sm leading-snug font-semibold transition-colors">
                              <Link
                                href={
                                  orgSlug
                                    ? `/${orgSlug}/projects/${project.id}`
                                    : '#'
                                }
                              >
                                {project.name}
                              </Link>
                            </h3>
                          </article>
                        </FxTableCell>
                        <FxTableCell className="text-center align-middle">
                          <p className="text-muted-foreground text-sm font-medium whitespace-nowrap">
                            {project.clientName}
                          </p>
                        </FxTableCell>

                        <FxTableCell className="text-center align-middle">
                          <FxBadge
                            variant={statusConfig.variant}
                            className="whitespace-nowrap capitalize"
                          >
                            {statusConfig.label}
                          </FxBadge>
                        </FxTableCell>

                        <FxTableCell className="text-center align-middle">
                          <span className="text-muted-foreground text-[12.5px] font-medium whitespace-nowrap">
                            {engagementLabelMap[project.engagement] ??
                              project.engagement}
                          </span>
                        </FxTableCell>

                        <FxTableCell className="text-center align-middle">
                          <div className="mx-auto flex w-40 items-center justify-center gap-3">
                            <FxProgress
                              value={project.progressPercent}
                              className="h-2 w-24 shrink-0"
                            />
                            <span className="text-2xs text-muted-foreground w-8 text-right font-mono font-medium whitespace-nowrap">
                              {project.progressPercent}%
                            </span>
                          </div>
                        </FxTableCell>

                        <FxTableCell
                          numeric
                          className="text-foreground text-center font-bold whitespace-nowrap"
                        >
                          {numericValue > 0 ? formattedValue : '—'}
                        </FxTableCell>
                      </FxTableRow>
                    )
                  })
                )}
              </TableBody>
            </FxTable>
          </div>

          {totalCount > 0 && (
            <div className="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground text-center text-xs font-medium sm:text-left">
                Showing {startItem} to {endItem} of {totalCount} projects
              </span>

              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <FxButton
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isPending}
                  onClick={handlePrevPage}
                >
                  Previous
                </FxButton>
                <span className="text-foreground px-2 text-xs font-semibold whitespace-nowrap">
                  Page {page} of {totalPages || 1}
                </span>
                <FxButton
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isPending}
                  onClick={handleNextPage}
                >
                  Next
                </FxButton>
              </div>
            </div>
          )}
        </FxCard>
      </section>
    </div>
  )
}
