import { FxCard } from '@/components/shared/fx-card'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody } from '@/components/ui/table'

interface ProjectsLoadingSkeletonProps {
  count?: number
  variant?: 'full' | 'rows'
}

export function ProjectsLoadingSkeleton({
  count = 10,
  variant = 'full',
}: ProjectsLoadingSkeletonProps) {
  const renderRows = () =>
    Array.from({ length: count }).map((_, index) => (
      <FxTableRow
        key={`row-skeleton-${index}`}
        className="h-16.25 transition-colors"
      >
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex w-fit flex-col items-start overflow-hidden">
            <Skeleton className="h-4 w-36" />
          </div>
        </FxTableCell>
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex w-fit justify-center">
            <Skeleton className="h-4 w-24" />
          </div>
        </FxTableCell>
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex justify-center">
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </FxTableCell>
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex justify-center">
            <Skeleton className="h-4 w-20" />
          </div>
        </FxTableCell>
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex w-40 items-center justify-center gap-3">
            <Skeleton className="h-2 w-24 rounded-full" />
            <Skeleton className="h-4 w-8" />
          </div>
        </FxTableCell>
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex justify-center">
            <Skeleton className="h-4 w-16" />
          </div>
        </FxTableCell>
      </FxTableRow>
    ))

  if (variant === 'rows') {
    return <>{renderRows()}</>
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="ds:items-between ds:justify-between flex flex-col gap-4 md:flex-row md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-36" />
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
                {renderRows()}
              </TableBody>
            </FxTable>
          </div>

          <div className="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-4 w-48" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        </FxCard>
      </section>
    </div>
  )
}
