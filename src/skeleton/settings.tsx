import { Skeleton } from '@/components/ui/skeleton'

function RowSkeleton() {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-3.5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-3.5 w-36" />
    </div>
  )
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="min-w-0">
      <div className="border-border border-b pb-3">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="divide-border divide-y border-b">
        {Array.from({ length: rows }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="border-border flex gap-7 border-b px-3.5 pt-2.5 pb-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="mt-3 grid gap-10 lg:grid-cols-2 lg:gap-12">
        <SectionSkeleton rows={4} />
        <SectionSkeleton rows={4} />
      </div>
    </div>
  )
}
