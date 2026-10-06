import { FxTableCell, FxTableRow } from '@/components/shared/fx-table'
import { Skeleton } from '@/components/ui/skeleton'

export function TableRowSkeleton() {
  return (
    <FxTableRow className="h-16.25">
      <FxTableCell>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </FxTableCell>
      <FxTableCell className="align-middle">
        <Skeleton className="h-5 w-24 rounded-full" />
      </FxTableCell>
      <FxTableCell className="align-middle">
        <Skeleton className="h-4 w-20" />
      </FxTableCell>
      <FxTableCell className="align-middle">
        <div className="flex items-center gap-3">
          <Skeleton className="h-2 flex-1" />
          <Skeleton className="h-3 w-8" />
        </div>
      </FxTableCell>
      <FxTableCell className="text-right align-middle">
        <Skeleton className="ml-auto h-4 w-16" />
      </FxTableCell>
    </FxTableRow>
  )
}
