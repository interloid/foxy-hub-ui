import { FxCard } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

export function ProfileCardSkeleton() {
  return (
    <FxCard>
      {/* Header Avatar & Info */}
      <div className="border-border flex items-center gap-4 border-b px-5 py-5.5">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>

      {/* Form Fields */}
      <div className="flex flex-col gap-3.5 p-5">
        {/* Full Name field */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>

        {/* Email field */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>

        {/* Role field */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>

      {/* Footer Action Buttons */}
      <div className="border-border flex items-center justify-between gap-2 border-t px-5 py-3.5">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
    </FxCard>
  )
}
