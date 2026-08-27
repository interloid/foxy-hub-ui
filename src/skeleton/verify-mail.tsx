import { FxCard } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

export function CheckEmailSkeleton() {
  return (
    <FxCard className="flex flex-col items-center justify-center p-8 text-center">
      {/* Icon Circle Skeleton */}
      <Skeleton className="mb-4 size-12 rounded-full" />

      {/* Title Skeleton */}
      <Skeleton className="mb-2 h-6 w-40" />

      {/* Description Text Lines Skeleton */}
      <div className="flex flex-col items-center space-y-1.5">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
    </FxCard>
  )
}
