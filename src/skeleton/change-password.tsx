import { FxCard } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

export function ChangePasswordSkeleton() {
  return (
    <FxCard>
      <div className="border-border space-y-4 rounded-xl border p-5">
        <div className="space-y-2">
          <Skeleton className="bg-muted dark:bg-muted h-4 w-28" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-full rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="bg-muted dark:bg-muted h-4 w-24" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-full rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="bg-muted dark:bg-muted h-4 w-32" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-full rounded-md" />
        </div>
        <div className="mt-1 flex justify-end gap-2 pt-2">
          <Skeleton className="bg-muted dark:bg-muted h-9 w-20 rounded-md" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-28 rounded-md" />
        </div>
      </div>
    </FxCard>
  )
}
