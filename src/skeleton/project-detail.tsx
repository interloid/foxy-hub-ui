import { Skeleton } from '@/components/ui/skeleton'

export function ProjectDetailSkeleton() {
  return (
    <main className="ds:p-6 min-w-full space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* Tabs List Skeleton */}
      <div className="border-b pb-2">
        <div className="flex items-center gap-6">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-18" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>

      {/* Overview Layout Skeleton */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Latest Updates Card */}
          <div className="space-y-4 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          </div>

          {/* Deliverables Section Card */}
          <div className="space-y-4 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          </div>
        </div>

        {/* Right Column (Sidebar Widgets) */}
        <div className="space-y-6">
          {/* Progress Card */}
          <div className="space-y-3 rounded-xl border p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>

          {/* Engagement Card */}
          <div className="space-y-3 rounded-xl border p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Hours Burn Card */}
          <div className="space-y-3 rounded-xl border p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>

          {/* Milestones List Card */}
          <div className="space-y-3 rounded-xl border p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Client Card */}
          <div className="flex items-center gap-4 rounded-xl border p-5">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
