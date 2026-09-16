import { FxCard } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

export function InvoicesPageSkeleton() {
  return (
    <main className="ds:p-6 animate-pulse space-y-6">
      {/* Invoices Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </div>

      {/* Invoice Metrics Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <FxCard key={idx} className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-36" />
          </FxCard>
        ))}
      </div>

      {/* Invoices Table Skeleton */}
      <div className="space-y-4">
        <div className="bg-card border-border/80 overflow-hidden rounded-2xl border shadow-xs">
          {/* Table Header */}
          <div className="bg-muted/40 border-border/60 grid grid-cols-5 items-center border-b px-6 py-3.5 text-center">
            <Skeleton className="h-4 w-16 justify-self-center" />
            <Skeleton className="h-4 w-24 justify-self-center" />
            <Skeleton className="h-4 w-20 justify-self-center" />
            <Skeleton className="h-4 w-20 justify-self-center" />
            <Skeleton className="h-4 w-16 justify-self-center" />
          </div>

          {/* Table Rows */}
          <div className="divide-border/40 divide-y">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="grid grid-cols-5 items-center px-6 py-4 text-center"
              >
                <Skeleton className="h-4 w-20 justify-self-center" />
                <Skeleton className="h-4 w-32 justify-self-center" />
                <Skeleton className="h-4 w-28 justify-self-center" />
                <Skeleton className="h-4 w-16 justify-self-center" />
                <Skeleton className="h-6 w-20 justify-self-center rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Pagination Skeleton */}
        <div className="flex items-center justify-between px-2 pt-2">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </div>
    </main>
  )
}
