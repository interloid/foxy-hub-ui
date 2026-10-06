import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
} from '@/components/shared/fx-table'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody } from '@/components/ui/table'

function MetricCardSkeleton() {
  return (
    <FxCard>
      <FxCardContent className="space-y-1.5 p-5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-32" />
      </FxCardContent>
    </FxCard>
  )
}

/**
 * Mirrors `MembersClientsView` — the members tab, which is what the page opens on. Same
 * headers, same five columns, same two-line cells, so the real content lands roughly where
 * the placeholder was rather than jumping. `h-16.25` is the row height the other table
 * skeletons use; the real rows size from their content and come out close to it.
 */
export function MembersClientsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex w-full flex-col gap-5 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>

      <Skeleton className="h-9 w-56 rounded-lg" />

      <FxCard className="overflow-hidden p-0">
        <div className="w-full overflow-x-auto">
          <FxTable className="w-full min-w-160">
            <FxTableHeader>
              <FxTableRow className="bg-secondary/30 hover:bg-secondary/30">
                <FxTableHead>Person</FxTableHead>
                <FxTableHead>Work email</FxTableHead>
                <FxTableHead>Role</FxTableHead>
                <FxTableHead>Status</FxTableHead>
                <FxTableHead className="text-right">Manage</FxTableHead>
              </FxTableRow>
            </FxTableHeader>

            <TableBody className="divide-border divide-y">
              {Array.from({ length: count }).map((_, index) => (
                <FxTableRow
                  key={`member-skeleton-${index}`}
                  className="h-16.25"
                >
                  <FxTableCell className="align-middle">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 shrink-0 rounded-full" />
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </FxTableCell>

                  <FxTableCell className="align-middle">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-44" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </FxTableCell>

                  <FxTableCell className="align-middle">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </FxTableCell>

                  <FxTableCell className="align-middle">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="size-1.5 rounded-full" />
                      <Skeleton className="h-3.5 w-14" />
                    </div>
                  </FxTableCell>

                  <FxTableCell className="align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <Skeleton className="h-7 w-14 rounded-md" />
                      <Skeleton className="h-7 w-22 rounded-md" />
                    </div>
                  </FxTableCell>
                </FxTableRow>
              ))}
            </TableBody>
          </FxTable>
        </div>
      </FxCard>

      <Skeleton className="h-3 w-80 max-w-full" />
    </div>
  )
}
