import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

export function PortalDashboardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <FxCard key={`tile-${index}`}>
            <FxCardContent className="flex flex-col justify-between gap-4 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="size-6.5 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            </FxCardContent>
          </FxCard>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-20">
        <div className="space-y-6 lg:col-span-11">
          {/* Pending approvals: badge square, two lines, View button */}
          <FxCard className="overflow-hidden">
            <FxCardContent className="p-0">
              <div className="border-border flex items-center gap-2.5 border-b px-5 py-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-20 rounded-full" />
              </div>
              <div className="divide-border divide-y">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`approval-${index}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-5">
                      <Skeleton className="h-8.5 w-8.5 shrink-0 rounded-xl" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-44" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-20 shrink-0 rounded-lg" />
                  </div>
                ))}
              </div>
            </FxCardContent>
          </FxCard>

          {/* Active projects */}
          <FxCard>
            <FxCardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`project-${index}`}
                    className="grid grid-cols-4 items-center gap-2"
                  >
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

        <div className="space-y-6 lg:col-span-9">
          <FxCard>
            <FxCardContent className="space-y-4 p-4">
              <Skeleton className="h-5 w-32" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`activity-${index}`}
                    className="flex items-center gap-3"
                  >
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
        </div>
      </div>
    </div>
  )
}
