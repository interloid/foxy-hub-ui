import { Skeleton } from '@/components/ui/skeleton'

// Its own skeleton - otherwise the parent Time page's skeleton would show here.
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-150 rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
