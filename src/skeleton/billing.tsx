import { FxCard, FxCardContent } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'

function DetailRowSkeleton({ value = 'w-24' }: { value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className={`h-3.5 ${value}`} />
    </div>
  )
}

function PlanCardSkeleton() {
  return (
    <FxCard className="self-start">
      <FxCardContent className="space-y-5 p-5">
        {/* Plan name & status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          <Skeleton className="h-8.5 w-20" />
          <Skeleton className="h-3.5 w-14" />
        </div>

        {/* Seats used */}
        <div className="space-y-2.5">
          <DetailRowSkeleton value="w-12" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>

        {/* Next renewal, payment method */}
        <div className="space-y-2.5">
          <DetailRowSkeleton />
          <DetailRowSkeleton value="w-28" />
        </div>

        {/* Manage in Stripe, Change plan */}
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        {/* Cancel subscription */}
        <Skeleton className="h-9 w-full rounded-md" />
      </FxCardContent>
    </FxCard>
  )
}

function PlanUnlocksSkeleton() {
  return (
    <FxCard>
      <FxCardContent className="p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-1.5 h-3 w-48 max-w-full" />
        <div className="mt-4 space-y-2.5">
          {['w-44', 'w-32', 'w-40'].map((width) => (
            <div key={width} className="flex items-center gap-2.5">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
          ))}
        </div>
      </FxCardContent>
    </FxCard>
  )
}

function RecentChargesSkeleton() {
  return (
    <FxCard>
      <FxCardContent className="p-5">
        <Skeleton className="h-4 w-28" />
        <div className="divide-border border-border mt-3 divide-y border-b">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      </FxCardContent>
    </FxCard>
  )
}

/** Mirrors BillingView's layout, so nothing shifts when the real page arrives. */
export function BillingSkeleton() {
  return (
    <div className="flex w-full flex-col gap-5 md:p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <PlanCardSkeleton />
        <div className="flex flex-col gap-4">
          <PlanUnlocksSkeleton />
          <RecentChargesSkeleton />
        </div>
      </div>
    </div>
  )
}
