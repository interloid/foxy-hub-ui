import { Skeleton } from '@/components/ui/skeleton'

export function PaymentSuccessLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="bg-background w-full max-w-md space-y-4 rounded-lg border p-6 shadow-lg">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>

        <Skeleton className="mx-auto h-4 w-40" />
        <Skeleton className="mx-auto h-10 w-24" />
      </div>
    </div>
  )
}
