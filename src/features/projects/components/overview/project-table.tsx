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
import { TableRowSkeleton } from '@/skeleton/table-row'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { fetchProjectsAction } from '../../actions'
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

  // 1. Derive current page directly from URL search params (no useState needed for page)
  const urlPageParam = searchParams.get('page')
  const page = urlPageParam ? parseInt(urlPageParam, 10) : initialPage

  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const isInitialMount = useRef(true)

  // Helper to push URL state updates
  const updatePageUrl = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', newPage.toString())
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // 2. Fetch data automatically whenever `page`, `orgSlug`, or `pageSize` changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    let isCurrent = true

    async function fetchPageData() {
      setIsLoading(true)
      try {
        const result = await fetchProjectsAction(orgSlug, page, pageSize)
        if (isCurrent && result) {
          setProjects(result.projects ?? [])
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err)
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    fetchPageData()

    return () => {
      isCurrent = false
    }
  }, [page, orgSlug, pageSize])

  const handleNextPage = () => {
    if (page < totalPages && !isLoading) {
      updatePageUrl(page + 1)
    }
  }

  const handlePrevPage = () => {
    if (page > 1 && !isLoading) {
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
            <h1 className="text-foreground ds:text-2xl min-w-0 text-[22px] font-bold tracking-tight">
              All Projects
            </h1>
          </div>
        </div>
      </header>

      <section aria-labelledby="all-projects-table-heading">
        <FxCard className="border-border shadow-card overflow-hidden p-0 2xl:mx-20">
          <div className="min-h-162.5 w-full overflow-x-auto">
            <FxTable className="w-full min-w-197.5 table-fixed">
              <FxTableHeader>
                <FxTableRow className="bg-secondary/30">
                  <FxTableHead className="w-62.5">Project</FxTableHead>
                  <FxTableHead className="w-35">Status</FxTableHead>
                  <FxTableHead className="w-35">Engagement</FxTableHead>
                  <FxTableHead className="w-35">Progress</FxTableHead>
                  <FxTableHead className="w-30 text-right">Value</FxTableHead>
                </FxTableRow>
              </FxTableHeader>

              <TableBody className="divide-border divide-y text-xs">
                {isLoading ? (
                  Array.from({ length: pageSize }).map((_, index) => (
                    <TableRowSkeleton key={`row-skeleton-${index}`} />
                  ))
                ) : projects.length === 0 ? (
                  <FxTableRow>
                    <FxTableCell
                      colSpan={5}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No projects found.
                    </FxTableCell>
                  </FxTableRow>
                ) : (
                  projects.map((project) => {
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
                        <FxTableCell>
                          <article className="flex flex-col overflow-hidden">
                            <h3 className="group-hover:text-primary text-foreground duration-fast truncate text-sm leading-snug font-semibold transition-colors">
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
                            <p className="text-2xs text-muted-foreground mt-0.5 truncate">
                              {project.clientName}
                            </p>
                          </article>
                        </FxTableCell>

                        <FxTableCell className="align-middle">
                          <FxBadge
                            variant={statusConfig.variant}
                            className="whitespace-nowrap capitalize"
                          >
                            {statusConfig.label}
                          </FxBadge>
                        </FxTableCell>

                        <FxTableCell className="align-middle">
                          <span className="text-muted-foreground text-[12.5px] font-medium whitespace-nowrap">
                            {engagementLabelMap[project.engagement] ??
                              project.engagement}
                          </span>
                        </FxTableCell>

                        <FxTableCell className="align-middle">
                          <div className="flex items-center gap-3">
                            <FxProgress
                              value={project.progressPercent}
                              className="h-2 flex-1"
                            />
                            <span className="text-2xs text-muted-foreground w-8 text-right font-mono font-medium whitespace-nowrap">
                              {project.progressPercent}%
                            </span>
                          </div>
                        </FxTableCell>

                        <FxTableCell
                          numeric
                          className="text-foreground align-middle font-bold whitespace-nowrap"
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
                  disabled={page <= 1 || isLoading}
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
                  disabled={page >= totalPages || isLoading}
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
