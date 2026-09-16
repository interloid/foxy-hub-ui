import { FxCard } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

export function TimePageSkeleton() {
  return (
    <main className="ds:p-6 animate-pulse space-y-6">
      {/* Time Tracking Section Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* Main Time Card Section */}
      <FxCard className="space-y-6 p-6">
        {/* Navigation Tabs Header Skeleton */}
        <div className="border-border/60 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-6">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-20" />
          </div>
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>

        {/* Weekly Summary Metrics Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-card border-border/50 flex flex-col justify-between space-y-3 rounded-xl border p-4"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>

        {/* Time Entries Table Skeleton */}
        <div className="border-border/80 overflow-hidden rounded-2xl border">
          {/* Table Header */}
          <div className="bg-muted/40 border-border/60 flex items-center justify-between border-b px-4 py-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>

          {/* Table Rows */}
          <div className="divide-border/40 divide-y">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-4 py-4"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </FxCard>
    </main>
  )
}
