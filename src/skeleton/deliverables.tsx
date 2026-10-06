import { FxTableCell, FxTableRow } from '@/components/shared/fx-table'
import { Skeleton } from '@/components/ui/skeleton'

interface DeliverablesLoadingSkeletonProps {
  count?: number
  isOverview?: boolean
}

export function DeliverablesLoadingSkeleton({
  count = 5,
  isOverview = false,
}: DeliverablesLoadingSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <FxTableRow key={`deliverable-skeleton-${index}`}>
          <FxTableCell className="text-center align-middle">
            <div className="mx-auto flex justify-center">
              <Skeleton className="h-4 w-14" />
            </div>
          </FxTableCell>
          <FxTableCell className="text-center align-middle">
            <div className="mx-auto flex justify-center">
              <Skeleton className="h-4 w-28" />
            </div>
          </FxTableCell>
          <FxTableCell className="text-center align-middle">
            <div className="mx-auto flex justify-center">
              <Skeleton className="h-4 w-36" />
            </div>
          </FxTableCell>
          <FxTableCell className="text-center align-middle">
            <div className="mx-auto flex justify-center">
              <Skeleton className="h-4 w-24" />
            </div>
          </FxTableCell>
          <FxTableCell className="text-center align-middle">
            <div className="mx-auto flex justify-center">
              <Skeleton className="h-4 w-14" />
            </div>
          </FxTableCell>
          <FxTableCell className="text-center align-middle">
            <div className="mx-auto flex justify-center">
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </FxTableCell>
          {!isOverview && (
            <FxTableCell className="text-center align-middle">
              <div className="mx-auto flex justify-center">
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </FxTableCell>
          )}
        </FxTableRow>
      ))}
    </>
  )
}
