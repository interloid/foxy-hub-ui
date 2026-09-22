import { FxCard } from '@/components/shared/fx-card'
import {
  FxTable,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody } from '@/components/ui/table'
import { ProjectsLoadingSkeleton } from '@/skeleton/projects-overview'

export function PortalProjectsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:items-start md:justify-between lg:flex-row">
          <div className="space-y-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-10 w-70 max-w-full rounded-lg" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-3 w-32 sm:ml-auto" />
        </div>

        <FxCard className="border-border shadow-card overflow-hidden p-0">
          <div className="w-full overflow-x-auto">
            <FxTable className="w-full min-w-236 table-fixed">
              <FxTableHeader>
                <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
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
                <ProjectsLoadingSkeleton count={count} variant="rows" />
              </TableBody>
            </FxTable>
          </div>
        </FxCard>
      </div>
    </div>
  )
}
