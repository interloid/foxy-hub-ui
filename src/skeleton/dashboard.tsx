import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 md:p-3 lg:p-0">
      {/* Dashboard Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Stats Grid Skeleton (4 cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <FxCard key={i}>
            <FxCardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="size-4 rounded-full" />
              </div>
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-32" />
            </FxCardContent>
          </FxCard>
        ))}
      </div>

      {/* Grid ratio: 60% Left / 40% Right */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        {/* Main Content Column (60%) */}
        <div className="space-y-6 lg:col-span-3">
          {/* Pending Approvals Skeleton */}
          <FxCard>
            <FxCardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-20 rounded-md" />
                  </div>
                ))}
              </div>
            </FxCardContent>
          </FxCard>

          {/* Active Projects Skeleton */}
          <FxCard>
            <FxCardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-4 items-center gap-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-2 w-full rounded-full" />
                    <Skeleton className="h-4 w-12 justify-self-end" />
                  </div>
                ))}
              </div>
            </FxCardContent>
          </FxCard>
        </div>

        {/* Sidebar Column (40%) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recent Activity Skeleton */}
          <FxCard>
            <FxCardContent className="space-y-4 p-4">
              <Skeleton className="h-5 w-32" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="w-full space-y-1">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </FxCardContent>
          </FxCard>

          {/* Team Capacity Skeleton */}
          <FxCard>
            <FxCardContent className="space-y-4 p-4">
              <Skeleton className="h-5 w-28" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-12" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </FxCardContent>
          </FxCard>

          {/* Studio Plan Card Skeleton */}
          <FxCard>
            <FxCardContent className="space-y-3 p-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-9 w-full rounded-md" />
            </FxCardContent>
          </FxCard>
        </div>
      </div>
    </div>
  )
}
