import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center space-y-6 p-6">
      <div className="flex w-full max-w-5xl items-center justify-between">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>

      <div className="flex flex-col items-center space-y-4 text-center">
        <Skeleton className="h-12 w-80 rounded-lg sm:w-96" />
        <Skeleton className="h-5 w-64 rounded-md" />
      </div>

      <Skeleton className="h-4 w-32 rounded-md" />
    </div>
  )
}
