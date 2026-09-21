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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { TableBody } from '@/components/ui/table'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { formatCurrency } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ProjectsLoadingSkeleton } from '@/skeleton/projects-overview'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import {
  ENGAGEMENT_LABELS,
  PAGE_SIZE_OPTIONS,
  PROJECT_STATUS_CONFIG,
} from '../../constants'
import { PROJECT_HEALTH_VARIANT } from '../../lib/project-health'
import type { Project, ProjectStatus } from '../../types'

interface ProjectTableProps {
  initialProjects?: Project[]
  orgSlug?: string
  page?: number
  totalPages?: number
  totalCount?: number
  pageSize?: number
  isPending?: boolean
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '…')[] = [1]

  if (current > 3) pages.push('…')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let p = start; p <= end; p++) pages.push(p)

  if (current < total - 2) pages.push('…')

  pages.push(total)

  return pages
}

const statusBadgeVariant: Record<
  ProjectStatus,
  'success' | 'info' | 'warning' | 'destructive' | 'secondary'
> = {
  'in-progress': 'info',
  pending: 'secondary',
  'pending-approval': 'secondary',
  'on-hold': 'warning',
  draft: 'info',
  completed: 'secondary',
  cancelled: 'destructive',
}

function formatDueDate(dueDate?: string | null): string {
  if (!dueDate) return '—'

  try {
    return format(parseISO(dueDate), 'MMM d')
  } catch {
    return '—'
  }
}

export function ProjectTable({
  initialProjects = [],
  orgSlug = '',
  page = 1,
  totalPages = 1,
  totalCount = 0,
  pageSize = 10,
  isPending = false,
  onPageChange,
  onPageSizeChange,
}: ProjectTableProps) {
  const handleNextPage = () => {
    if (page < totalPages && !isPending) {
      onPageChange?.(page + 1)
    }
  }

  const handlePrevPage = () => {
    if (page > 1 && !isPending) {
      onPageChange?.(page - 1)
    }
  }

  const { currency } = useWorkspace()
  const pageNumbers = getPageNumbers(page, totalPages || 1)

  return (
    <div className="flex w-full flex-col gap-5">
      <section aria-labelledby="all-projects-table-heading">
        <FxCard className="border-border shadow-card overflow-hidden p-0">
          <div className="min-h-162.5 w-full overflow-x-auto">
            <FxTable className="w-full min-w-236 table-fixed">
              <FxTableHeader>
                <FxTableRow className="bg-secondary/30 hover:bg-secondary/30 justify-center">
                  <FxTableHead className="w-56">Project</FxTableHead>
                  <FxTableHead className="w-32">Client</FxTableHead>
                  <FxTableHead className="w-28">Health</FxTableHead>
                  <FxTableHead className="w-36">Hours burned</FxTableHead>
                  <FxTableHead className="w-36">Progress</FxTableHead>
                  <FxTableHead className="w-28 text-center">Value</FxTableHead>
                  <FxTableHead className="w-20 text-center">Due</FxTableHead>
                </FxTableRow>
              </FxTableHeader>

              <TableBody className="divide-border divide-y text-xs">
                {isPending ? (
                  <ProjectsLoadingSkeleton variant="rows" />
                ) : initialProjects.length === 0 ? (
                  <FxTableRow>
                    <FxTableCell
                      colSpan={7}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No projects found.
                    </FxTableCell>
                  </FxTableRow>
                ) : (
                  initialProjects.map((project) => {
                    const statusConfig = PROJECT_STATUS_CONFIG[
                      project.status
                    ] ?? {
                      label: project.status,
                    }
                    const statusVariant =
                      statusBadgeVariant[project.status] ?? 'secondary'

                    const health = project.health

                    const numericValue =
                      project.contractValue ?? project.retainerAmount ?? 0

                    const formattedValue = formatCurrency(
                      numericValue,
                      currency
                    )

                    return (
                      <FxTableRow
                        key={project.id}
                        className="hover:bg-muted/40 duration-fast group h-16.25 transition-colors"
                      >
                        <FxTableCell className="align-middle">
                          <article className="flex flex-col items-start gap-1.5 overflow-hidden">
                            <h3 className="group-hover:text-primary text-foreground duration-fast w-full truncate text-left text-sm leading-snug font-semibold transition-colors">
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
                            <div className="flex items-center gap-2">
                              <FxBadge
                                variant={statusVariant}
                                size="sm"
                                className="whitespace-nowrap capitalize"
                              >
                                {statusConfig.label}
                              </FxBadge>
                              <span className="text-subtle-foreground text-2xs font-medium whitespace-nowrap">
                                {ENGAGEMENT_LABELS[project.engagement] ??
                                  project.engagement}
                              </span>
                            </div>
                          </article>
                        </FxTableCell>
                        <FxTableCell className="align-middle">
                          <p className="text-muted-foreground text-sm font-medium whitespace-nowrap">
                            {project.clientName}
                          </p>
                        </FxTableCell>

                        <FxTableCell className="align-middle">
                          {health ? (
                            <FxBadge
                              variant={PROJECT_HEALTH_VARIANT[health.status]}
                              size="sm"
                              dot
                              className="whitespace-nowrap"
                            >
                              {health.label}
                            </FxBadge>
                          ) : (
                            <span className="text-muted-foreground text-[12.5px]">
                              —
                            </span>
                          )}
                        </FxTableCell>

                        <FxTableCell className="align-middle">
                          {health && health.hoursBurnedPercent !== null ? (
                            <div className="flex w-32 items-center gap-3">
                              <FxProgress
                                value={Math.min(health.hoursBurnedPercent, 100)}
                                variant={PROJECT_HEALTH_VARIANT[health.status]}
                                className="h-2 w-full shrink-0"
                              />
                              <span className="text-2xs text-muted-foreground w-9 text-right font-mono font-medium whitespace-nowrap">
                                {health.hoursBurnedPercent}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-subtle-foreground text-[12.5px] whitespace-nowrap">
                              No estimate
                            </span>
                          )}
                        </FxTableCell>

                        <FxTableCell className="align-middle">
                          <div className="flex w-32 items-center gap-3">
                            <FxProgress
                              value={project.progressPercent}
                              className="h-2 w-full shrink-0"
                            />
                            <span className="text-2xs text-muted-foreground w-9 text-right font-mono font-medium whitespace-nowrap">
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

                        <FxTableCell className="text-muted-foreground text-center text-[12.5px] font-medium whitespace-nowrap">
                          {formatDueDate(project.dueDate)}
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
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
                  Page {page} of {totalPages || 1}
                </span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => onPageSizeChange?.(Number(value))}
                >
                  <SelectTrigger
                    size="sm"
                    className="border-border bg-card hover:bg-muted cursor-pointer rounded-full text-xs font-medium"
                  >
                    <span>{pageSize} per page</span>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    sideOffset={6}
                    className="p-1"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem
                        key={size}
                        value={String(size)}
                        className="cursor-pointer p-2"
                      >
                        {size} per page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <FxButton
                  variant="outline"
                  size="sm"
                  className="gap-1 px-2.5"
                  disabled={page <= 1 || isPending}
                  onClick={handlePrevPage}
                >
                  <ChevronLeft className="size-3.5" />
                  Prev
                </FxButton>

                {pageNumbers.map((p, index) =>
                  p === '…' ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="text-muted-foreground px-1.5 text-xs"
                    >
                      …
                    </span>
                  ) : (
                    <FxButton
                      key={p}
                      variant={p === page ? 'secondary' : 'outline'}
                      size="sm"
                      className={cn(
                        `w-8 px-0`,
                        p === page &&
                          'bg-primary-subtle text-primary border-primary'
                      )}
                      disabled={isPending || p === page}
                      onClick={() => onPageChange?.(p)}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </FxButton>
                  )
                )}

                <FxButton
                  variant="outline"
                  size="sm"
                  className="gap-1 px-2.5"
                  disabled={page >= totalPages || isPending}
                  onClick={handleNextPage}
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </FxButton>
              </div>
            </div>
          )}
        </FxCard>
      </section>
    </div>
  )
}
