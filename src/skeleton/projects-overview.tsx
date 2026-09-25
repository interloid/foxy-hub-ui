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
        <FxTableCell className="align-middle">
          <div className="flex flex-col items-start gap-1.5 overflow-hidden">
            <Skeleton className="h-4 w-36" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        </FxTableCell>
        <FxTableCell className="align-middle">
          <div className="flex w-fit justify-start">
            <Skeleton className="h-4 w-24" />
          </div>
        </FxTableCell>
        <FxTableCell className="align-middle">
          <div className="flex justify-start">
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        </FxTableCell>
        <FxTableCell className="align-middle">
          <div className="flex w-32 items-center gap-3">
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-9" />
          </div>
        </FxTableCell>
        <FxTableCell className="align-middle">
          <div className="flex w-32 items-center gap-3">
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-9" />
          </div>
        </FxTableCell>
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex justify-center">
            <Skeleton className="h-4 w-16" />
          </div>
        </FxTableCell>
        <FxTableCell className="text-center align-middle">
          <div className="mx-auto flex justify-center">
            <Skeleton className="h-4 w-12" />
          </div>
        </FxTableCell>
      </FxTableRow>
    ))

  if (variant === 'rows') {
    return <>{renderRows()}</>
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-4 p-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-72" />
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-full sm:w-70" />
          <Skeleton className="h-9 w-32 shrink-0" />
        </div>
      </div>

      <Skeleton className="h-8 w-full max-w-125" />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-4 w-32 sm:ml-auto" />
      </div>

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
                {renderRows()}
              </TableBody>
            </FxTable>
          </div>

          <div className="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
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
